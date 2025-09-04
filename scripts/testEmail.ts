import { sendEmail } from "../src/lib/email";

async function main() {
  await sendEmail({
    to: "drjimcesca@gmail.com", // test your real inbox
    subject: "Test from DocSoloScheduler",
    html: "<p>Congrats 🎉 — your Resend setup is working!</p>",
  });
}

main();
