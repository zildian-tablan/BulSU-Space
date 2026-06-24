export function mfaEmailHTML(MFA_CODE: string) {

   return `
          <div style="
            font-family: 'Segoe UI', Arial, sans-serif;
            background-color: #f6f9fc;
            padding: 30px;
            text-align: center;
            border-radius: 10px;
          ">
            <div style="
              background: linear-gradient(90deg, #0052cc, #1e90ff);
              color: white;
              padding: 20px;
              border-radius: 10px 10px 0 0;
            ">
              <h1 style="margin: 0;">BulSU Space</h1>
            </div>
            <div style="
              background: white;
              padding: 25px;
              border-radius: 0 0 10px 10px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            ">
              <h2 style="color: #333;">Your Verification Code</h2>
              <p style="font-size: 40px; font-weight: bold; color: #0052cc; letter-spacing: 10px;">
                ${MFA_CODE}
              </p>
              <p style="color: #555;">This code will expire in <b>5 minutes</b>.</p>
              <p style="font-size: 14px; color: #777; margin-top: 30px;">
                If you didn’t request this, please ignore this email.
              </p>
            </div>
            <p style="margin-top: 25px; color: #999; font-size: 13px;">
              © ${new Date().getFullYear()} BulSU Space. All rights reserved.
            </p>
          </div>
        `
}

export function forgotPasswordHTML(urlLink: string) {
  
  return `
        <div style="
          font-family: 'Segoe UI', sans-serif;
          background-color: #f4fdf6;
          color: #2e2e2e;
          padding: 40px 20px;
          text-align: center;
        ">
          <div style="
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            max-width: 500px;
            margin: auto;
            padding: 30px 25px;
          ">
            <h2 style="
              color: #2b7a4b;
              margin-bottom: 16px;
            ">🔒 Password Reset Request</h2>

            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 30px;">
              We received a request to reset your password. If this was you, please click the button below to set a new password.
            </p>

            <a href="${urlLink}" style="
              background-color: #3cb371;
              color: #fff;
              text-decoration: none;
              padding: 12px 25px;
              border-radius: 8px;
              display: inline-block;
              font-weight: 600;
              transition: background 0.3s;
            ">Change Password</a>

            <p style="
              margin-top: 25px;
              font-size: 13px;
              color: #6b6b6b;
            ">
              Or copy and paste this link into your browser:
            </p>
            <p style="
              background-color: #f0f9f3;
              padding: 10px;
              border-radius: 6px;
              word-break: break-all;
              color: #2b7a4b;
              font-size: 13px;
            ">${urlLink}</p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e2e2;">

            <p style="font-size: 12px; color: #9a9a9a;">
              If you didn’t request this change, you can safely ignore this email.
            </p>
          </div>
        </div>
        `
}

export function newAccountEmailHTML(params: {
  name?: string;
  bulsuSpaceEmail: string;
  msEmail: string;
  password: string;
  portalLink: string;
}) {
  const { name, bulsuSpaceEmail, msEmail, password, portalLink } = params;

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background:#f6f9fc; padding:24px">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.08); overflow:hidden">
        <div style="background:linear-gradient(90deg,#0e7a3e,#22c55e); color:#fff; padding:18px 22px">
          <h1 style="margin:0; font-size:20px">BulSU Space</h1>
          <div style="opacity:.9; font-size:13px; margin-top:4px">Welcome to the campus portal</div>
        </div>
        <div style="padding:22px">
          <h2 style="margin:0 0 8px; color:#0f172a; font-size:18px">Your BulSU Space account is ready</h2>
          ${name ? `<p style="margin:0 0 12px; color:#334155">Hello <strong>${name}</strong>,</p>` : ''}
          <p style="margin:0 0 16px; color:#334155">Here are your login details. Please keep them secure.</p>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; margin-bottom:16px">
            <div style="font-size:14px; color:#0f172a; margin-bottom:8px"><strong>Portal:</strong> <a href="${portalLink}" style="color:#0ea5e9; text-decoration:none">${portalLink}</a></div>
            <div style="font-size:14px; color:#0f172a; margin-bottom:6px"><strong>BulSUSpace Email:</strong> ${bulsuSpaceEmail}</div>
            <div style="font-size:14px; color:#0f172a; margin-bottom:6px"><strong>Delivery Email:</strong> ${msEmail}</div>
            <div style="font-size:14px; color:#0f172a"><strong>Temporary Password:</strong> ${password}</div>
          </div>
          <p style="margin:0 0 10px; color:#475569; font-size:14px">On first login, we recommend that you:</p>
          <ul style="margin:0 0 16px 18px; color:#475569; font-size:14px">
            <li>Change your password to something only you know</li>
            <li>Keep your account details private</li>
          </ul>
          <a href="${portalLink}" style="display:inline-block; background:#16a34a; color:#fff; text-decoration:none; padding:10px 16px; border-radius:8px; font-weight:600">Go to BulSU Space</a>
          <p style="margin:18px 0 0; color:#64748b; font-size:12px">If you didn’t request this account, you can ignore this email.</p>
        </div>
        <div style="padding:12px 22px; background:#f1f5f9; color:#64748b; font-size:12px">© ${new Date().getFullYear()} BulSU Space</div>
      </div>
    </div>
  `;
}

export function alumniInviteEmailHTML(params: {
  actionLink: string;
  invitedBy?: string;
}) {
  const { actionLink, invitedBy } = params;
  const inviterLine = invitedBy
    ? `<p style="margin:0 0 14px; color:#334155; font-size:15px"><strong>${invitedBy}</strong> warmly invites you to be part of the BulSU Hagonoy network.</p>`
    : '';

  return `
    <div style="font-family:'Segoe UI', Arial, sans-serif; background:#f6f9fc; padding:24px">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,0.08); overflow:hidden">
        <div style="background:linear-gradient(90deg,#5b21b6,#7c3aed); color:#fff; padding:20px 24px">
          <h1 style="margin:0; font-size:20px">BulSU Space Alumni Invite</h1>
          <div style="opacity:.9; font-size:13px; margin-top:6px">A digital home for the BulSU Hagonoy community</div>
        </div>
        <div style="padding:24px">
          <h2 style="margin:0 0 10px; color:#111827; font-size:20px">We would be honored to have you join us</h2>
          <p style="margin:0 0 14px; color:#334155; font-size:15px">
            We hope this message finds you well. BulSU Space is the official online platform for the Bulacan State University Hagonoy Campus—a place where alumni reconnect, collaborate, and continue making an impact on our community.
          </p>
          ${inviterLine}
          <p style="margin:0 0 18px; color:#475569; font-size:14px">
            Please tap the button below to begin the alumni onboarding steps at your convenience. After verification, you'll gain access to community discussions, events, mentoring opportunities, and other resources prepared especially for Kingfishers.
          </p>
          <div style="text-align:center; margin:30px 0">
            <a href="${actionLink}" style="display:inline-block; background:#7c3aed; color:#fff; text-decoration:none; padding:12px 28px; border-radius:999px; font-weight:600; box-shadow:0 10px 25px rgba(124,58,237,0.25)">
              Join Now
            </a>
          </div>
          <p style="margin:22px 0 0; color:#94a3b8; font-size:12px">You received this invite because your email was included in the alumni onboarding list. If this wasn't meant for you, feel free to ignore the message.</p>
        </div>
        <div style="padding:12px 22px; background:#f3f4f6; color:#94a3b8; font-size:12px">© ${new Date().getFullYear()} BulSU Space • BulSU Hagonoy Campus</div>
      </div>
    </div>
  `;
}