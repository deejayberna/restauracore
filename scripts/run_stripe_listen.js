require("dotenv").config({ path: ".env.local" });
const { spawn } = require("child_process");
const path = require("path");

const stripeBin = path.resolve(__dirname, "..", "bin", "stripe.exe");
const apiKey = process.env.STRIPE_SECRET_KEY;

if (!apiKey) {
  console.error("No STRIPE_SECRET_KEY found in .env.local");
  process.exit(1);
}

const args = [
  "listen",
  "--api-key",
  apiKey,
  "--events",
  "checkout.session.completed,customer.subscription.trial_will_end,invoice.payment_succeeded,invoice.payment_failed,customer.subscription.deleted",
  "--forward-to",
  "localhost:3000/api/webhooks/stripe",
];

console.log("Starting Stripe listen with arguments:", args.join(" "));
const child = spawn(stripeBin, args, { stdio: "inherit" });

child.on("exit", (code) => {
  console.log("Stripe listen exited with code", code);
});

