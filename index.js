const {google} = require('googleapis');
const {OAuth2Client} = require('google-auth-library');

const credentials = require('./client_secret.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = 'token.json';

const oauth2Client = new OAuth2Client(
  credentials.installed.client_id,
  credentials.installed.client_secret,
  credentials.installed.redirect_uris[0]
);

// Authorize with the Gmail API using the OAuth2Client
async function authorize() {
  try {
    const token = require('./' + TOKEN_PATH);
    oauth2Client.setCredentials(token);
  } catch (err) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const code = await new Promise((resolve, reject) => {
      process.stdin.once('data', chunk => resolve(chunk.toString().trim()));
    });
    const {tokens} = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log('Token stored to', TOKEN_PATH);
  }
}

// Get the Gmail API client with the OAuth2Client
async function getClient() {
  await authorize();
  return google.gmail({version: 'v1', auth: oauth2Client});
}

// Check if an email thread has been replied to by the user
async function isReplied(emailId) {
  const gmail = await getClient();
  const res = await gmail.users.threads.get({userId: 'me', id: emailId});
  const thread = res.data;
  if (!thread.messages || thread.messages.length < 2) {
    return false;
  }
  const lastMessage = thread.messages[thread.messages.length - 1];
  return lastMessage.labelIds.includes('SENT') && lastMessage.from.emailAddress === 'your-email-address';
}

// Send an auto-reply to an email
async function sendAutoReply(emailId) {
  const gmail = await getClient();
  const message = 'Hello, thank you for your email. I am currently out of office and will respond as soon as possible.';
  const resource = {
    threadId: emailId,
    message: {
      raw: Buffer.from(
        'From: your-email-address\r\n' +
        'To: ' + message.to + '\r\n' +
        'Subject: ' + message.subject + '\r\n' +
        '\r\n' +
        message.text
      ).toString('base64')
    }
  };
  await gmail.users.messages.send({userId: 'me', resource});
}

// Add a label to an email
async function addLabel(emailId, labelName) {
  const gmail = await getClient();
  const res = await gmail.users.messages.modify({
    userId: 'me',
    id: emailId,
    resource: {
      addLabelIds: [await getOrCreateLabel(labelName)]
    }
  });
  console.log('Label added to message:', res.data);
}

// Get or create a label with the given name
async function getOrCreateLabel(name) {
  const gmail = await getClient();
  let label = null;
