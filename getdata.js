const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const apiId = xxx; //Thay bằng apiId của bạn.
const apiHash = 'xxx'; //Thay bằng apiHash của bạn.
const sessionDir = './session';
const dataDir = './data';

const green = '\x1b[32m';
const reset = '\x1b[0m';

let selectedButtonIndex = null;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const prompt = (query) => new Promise(resolve => rl.question(query, resolve));

const ensureDirExists = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
};

const extractQuery = (iframe) => {
    const decodedUrl = decodeURIComponent(iframe);
    const queryStringStart = decodedUrl.indexOf('#tgWebAppData=');
    const queryString = decodedUrl.slice(queryStringStart + 14);
    let input = queryString;
    let index = input.indexOf('&tgWebAppVersion');
    if (index !== -1) {
        return input.substring(0, index);
    } else {
        return input;
    }
};

const extractToken = (iframe) => {
    let l = decodeURIComponent(iframe).match(/tgWebAppData=(.*)&tgWebAppVersion/)[1];
    let t = '{"' + decodeURIComponent(decodeURIComponent(l))
                .replace(/=/g, '":"')
                .replace(/&/g, '","')
                .replace(/"{/, "{")
                .replace(/}"/, "}") + '"}';
    return Buffer.from(unescape(encodeURIComponent(t))).toString('base64');
};

const handleButtonUrl = async (client, botUsername, selectedButton, choice) => {
    const webViewResult = await client.invoke(
        new Api.messages.RequestWebView({
            peer: await client.getInputEntity(botUsername),
            bot: await client.getInputEntity(botUsername),
            platform: 'android',
            fromBotMenu: false,
            url: selectedButton.url,
        })
    );

    const filePath = path.join(dataDir, `${choice}.${botUsername}.txt`);
    ensureDirExists(path.dirname(filePath));

    let dataToSave;
    if (choice === 'iframe') {
        dataToSave = webViewResult.url;
    } else if (choice === 'query') {
        dataToSave = extractQuery(webViewResult.url);
    } else if (choice === 'token') {
        dataToSave = extractToken(webViewResult.url);
    }

    fs.appendFileSync(filePath, dataToSave + '\n', 'utf8');
    console.log(`${green}Đã lưu ${choice} vào ${filePath}${reset}`);
};

const processSessionFile = async (file, choice, botUsername) => {
    console.log('Chuẩn bị xử lý file ', file);
    const sessionPath = path.join(sessionDir, file);
    const stringSession = new StringSession(fs.readFileSync(sessionPath, 'utf8').trim());
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

    console.log('Đang kết nối với Telegram...');
    await client.start();

    console.log('Đã kết nối với Telegram.');

    let message = await client.getMessages(botUsername, { limit: 1 });
    if (!message || message.length === 0 || !message[0].replyMarkup) {
        await client.sendMessage(botUsername, { message: '/start' });
        console.log('Đã gửi tin nhắn đến ' + botUsername + ', đang đợi phản hồi...');
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            message = await client.getMessages(botUsername, { limit: 1 });
            if (message.length > 0 && message[0].replyMarkup) {
                break;
            }
        }
    }

    if (message.length === 0 || !message[0].replyMarkup) {
        console.error('Không nhận được phản hồi.');
        process.exit(1);
    }

    //In ra tin nhắn phản hồi, xóa "//" bên dưới nếu cần.
    //console.log('Đã nhận được phản hồi:\n', message[0].message);
    console.log('Các nút có sẵn:');

    const buttons = message[0].replyMarkup.rows.flatMap(row => row.buttons);
    buttons.forEach((button, index) => console.log(`${index + 1}: ${button.text}`));

    let buttonIndex;
    let validSelection = false;
    
    while (!validSelection) {
        if (selectedButtonIndex === null) {
            buttonIndex = parseInt(await prompt('Chọn nút: ')) - 1;
            selectedButtonIndex = buttonIndex;
        } else {
            buttonIndex = selectedButtonIndex;
        }

        if (buttonIndex >= 0 && buttonIndex < buttons.length) {
            const button = buttons[buttonIndex];
            if (button.url) {
                console.log('Đã chọn nút:', button.text);
                await handleButtonUrl(client, botUsername, button, choice);
                validSelection = true;
            } else {
                console.error('Nút không chứa URL.');
                selectedButtonIndex = null;
            }
        } else {
            console.error('Lựa chọn không hợp lệ.');
            selectedButtonIndex = null;
        }
    }

    console.log('Đã ngắt kết nối với Telegram.');
    await client.disconnect();
};

(async () => {
    ensureDirExists(sessionDir);
    const sessionFiles = fs.readdirSync(sessionDir).filter(file => file.endsWith('.session'));
    if (sessionFiles.length === 0) {
        console.error('Không tìm thấy file .session trong thư mục session.');
        process.exit(1);
    }

    let choice;
    while (true) {
        choice = (await prompt('Chọn dữ liệu cần lấy (iframe/query/token): ')).toLowerCase();
        if (['iframe', 'query', 'token'].includes(choice)) break;
        console.error('Dữ liệu không hợp lệ.');
    }

    let botUsername;
    while (true) {
        botUsername = await prompt('Nhập bot username: ');
        if (botUsername.trim() !== '') break;
        console.error('Không được để trống bot username.');
    }

    for (const file of sessionFiles) {
        await processSessionFile(file, choice, botUsername);
    }

    console.log('Đã xử lý tất cả file .session');
    setTimeout(() => process.exit(0), 500);
})();
