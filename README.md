Kyata is an assistant bot living on WhatsApp that helps you ease your daily life!
It can help you manage your expenses as your Expense Tracker
It also helps you remind you of your tasks as your Tasks Tracker and Reminder

Easily launch on your PC by running
"node index.js"
inside the directory on your CLI

Requirements:

- Node.js
- SQLite3

Web app:

- Open the web app at `http://localhost:3000` while Kyata is running.
- Sign in with a WhatsApp number that can receive messages from the bot, then enter the one-time code sent by WhatsApp.
- Tasks are shared between WhatsApp direct chats and the web app using the verified phone number. Group tasks remain scoped to their WhatsApp group.
- The Tasks tab lists active-task groups that the signed-in WhatsApp number belongs to; selecting a group shows its active tasks.
- Finance data uses the same SQLite database in WhatsApp and the web app. The web app refreshes finance and task data every 15 seconds while open, and has a manual refresh button.
- Use the Profile tab to set your account name, task-summary time, and finance reminder schedule. The account name is used as your alias in WhatsApp task and finance replies.
- Use HTTPS when exposing the web app beyond localhost; the login session cookie is marked secure when served over HTTPS.
