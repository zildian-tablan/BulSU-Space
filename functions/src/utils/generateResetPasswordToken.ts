import crypto from "crypto";

async function generateResetPasswordToken() {

   // Generate random token
   const rawToken = crypto.randomBytes(32).toString("hex");

   // Hash it before storing in DB (for security)
   const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

   return {hashedToken, rawToken}
}

export default generateResetPasswordToken