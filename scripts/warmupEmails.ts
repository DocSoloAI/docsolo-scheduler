import { sendEmail } from "../src/lib/email";

const inboxes = [
  "jimcesca@gmail.com",
  // add more if you want
];

// Helper: wait for X ms
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const today = new Date().toLocaleDateString();
  console.log(`📨 Sending warm-up emails for ${today}...`);

  for (let i = 0; i < 5; i++) { // sends 5 per run
    for (const inbox of inboxes) {
      const subject = `Warm-up ${today} #${i + 1}`;
      const body = `
        <p>Hello 👋</p>
        <p>This is warm-up test #${i + 1} sent on ${today}.</p>
        <p>Please open, mark as not spam, and maybe reply 🙂</p>
      `;

      await sendEmail({ to: inbox, subject, html: body });

      // 🔑 Prevent hitting rate limits
      await sleep(600);
    }
  }

  console.log("✅ Warm-up batch sent.");
}

main();
