/**
 * Default email templates for new providers.
 * Called during sign-up or when seeding missing templates.
 */

// 🔑 Stock disclaimer (easy to change later)
const DISCLAIMER_TEXT = "No-show appointments may be billed by your provider.";

const DISCLAIMER_HTML = `
  <p style="margin-top: 1.5em; font-size: 0.75rem; color: #666;">
    ${DISCLAIMER_TEXT}
  </p>
`;

export function defaultTemplates(providerId: string) {
  return [
    // ✅ CONFIRMATION
    {
      provider_id: providerId,
      template_type: "confirmation",
      subject: "Appointment confirmed with {{providerName}} on {{date}} at {{time}}",
      body: `Your appointment with {{providerName}} is confirmed for {{date}} at {{time}}.

${DISCLAIMER_TEXT}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: auto; color: #111;">
          <h2 style="font-size: 1rem; font-weight: 500; color: #15803d; margin-bottom: 1em;">
            Your appointment is confirmed.
          </h2>

          <p>Your appointment with <strong>{{providerName}}</strong> is scheduled for:</p>

          <p style="font-weight: 600; margin: 1em 0;">
            {{date}} at {{time}}
          </p>

          <p>Location: <strong>{{location}}</strong></p>

          <p>
            <a href="{{manageLink}}" 
              style="display: inline-block; margin-top: 1em; padding: 10px 16px; background: #2563eb; color: #fff;
              text-decoration: none; border-radius: 6px; font-weight: 600;">
              Change / Cancel Appointment
            </a>
          </p>

          <p>If you have questions, call or text <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a></p>

          <p style="margin-top: 2em; font-size: 0.85rem; color: #555;">
            Appointment ID: {{appointmentId}}
          </p>

          ${DISCLAIMER_HTML}
        </div>
      `,
    },

    // ✅ REMINDER
    {
      provider_id: providerId,
      template_type: "reminder",
      subject: "Reminder: your appointment with {{providerName}}",
      body: `Reminder: you have an appointment with {{providerName}} on {{date}} at {{time}}.

${DISCLAIMER_TEXT}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: auto; color: #111;">
          <h2 style="font-size: 1rem; font-weight: 500; color: #2563eb; margin-bottom: 1em;">
            Upcoming appointment reminder
          </h2>

          <p>You have an appointment with <strong>{{providerName}}</strong> scheduled for:</p>

          <p style="font-weight: 600; margin: 1em 0;">
            {{date}} at {{time}}
          </p>

          <p>Location: <strong>{{location}}</strong></p>

          <p>
            <a href="{{manageLink}}" 
              style="display: inline-block; margin-top: 1em; padding: 10px 16px; background: #2563eb; color: #fff;
              text-decoration: none; border-radius: 6px; font-weight: 600;">
              Change / Cancel Appointment
            </a>
          </p>

          <p>If you have questions, call or text <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a></p>

          <p style="margin-top: 2em; font-size: 0.85rem; color: #555;">
            Appointment ID: {{appointmentId}}
          </p>

          ${DISCLAIMER_HTML}
        </div>
      `,
    },

    // ✅ CANCELLATION
    {
      provider_id: providerId,
      template_type: "cancellation",
      subject: "Appointment cancelled: {{date}} at {{time}}",
      body: `Your appointment on {{date}} at {{time}} has been cancelled.

    If you’d like to schedule another appointment, visit: https://{{subdomain}}.bookthevisit.com

    Questions? Call {{providerPhone}}.

    ${DISCLAIMER_TEXT}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: auto; color: #111;">
          <h2 style="font-size: 1rem; font-weight: 500; color: #dc2626; margin-bottom: 1em;">
            Your appointment has been cancelled.
          </h2>

          <p>The appointment scheduled for <strong>{{date}} at {{time}}</strong> has been cancelled.</p>

          <p>If you'd like to schedule another appointment, use the link below:</p>

          <p>
            <a href="https://{{subdomain}}.bookthevisit.com" 
              style="display: inline-block; margin-top: 1em; padding: 10px 16px; background: #2563eb; color: #fff;
              text-decoration: none; border-radius: 6px; font-weight: 600;">
              Schedule Another Appointment
            </a>
          </p>

          <p style="margin-top: 2em; font-size: 0.85rem; color: #555;">
            Questions? Call or text <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a><br/>
            {{providerName}} – {{location}}
          </p>

          ${DISCLAIMER_HTML}
        </div>
      `,
    },


    // ✅ UPDATE
    {
      provider_id: providerId,
      template_type: "update",
      subject: "Updated appointment with {{providerName}}",
      body: `Your appointment with {{providerName}} has been updated to {{date}} at {{time}}.

${DISCLAIMER_TEXT}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: auto; color: #111;">
          <h2 style="font-size: 1rem; font-weight: 500; color: #f59e0b; margin-bottom: 1em;">
            Your appointment details have changed.
          </h2>

          <p>Your appointment with <strong>{{providerName}}</strong> has been updated:</p>

          <p style="font-weight: 600; margin: 1em 0;">
            {{date}} at {{time}}
          </p>

          <p>Location: <strong>{{location}}</strong></p>

          <p>
            <a href="{{manageLink}}" 
              style="display: inline-block; margin-top: 1em; padding: 10px 16px; background: #2563eb; color: #fff;
              text-decoration: none; border-radius: 6px; font-weight: 600;">
              Change / Cancel Appointment
            </a>
          </p>

          <p>If you have questions, call or text <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a></p>

          <p style="margin-top: 2em; font-size: 0.85rem; color: #555;">
            Appointment ID: {{appointmentId}}
          </p>

          ${DISCLAIMER_HTML}
        </div>
      `,
    },

    // ✅ PROVIDER CONFIRMATION
    {
      provider_id: providerId,
      template_type: "provider_confirmation",
      subject: "[Appointment] {{patientName}} on {{date}} at {{time}}",
      body: "New appointment: {{patientName}} scheduled on {{date}} at {{time}}.",
      html_body: `
        <p><strong>New Appointment</strong></p>
        <p>Patient: {{patientName}}</p>
        <p>Email: {{patientEmail}}</p>
        <p>Phone: {{patientPhone}}</p>
        <p>Service: {{service}}</p>
        <p>Date/Time: {{date}} at {{time}}</p>
        {{#if patientNote}}<p><em>Note: {{patientNote}}</em></p>{{/if}}
        <p>Appointment ID: {{appointmentId}}</p>
      `,
    },

    // ✅ PROVIDER UPDATE
    {
      provider_id: providerId,
      template_type: "provider_update",
      subject: "[Updated] {{patientName}} on {{date}} at {{time}}",
      body: "Updated appointment: {{patientName}} now scheduled for {{date}} at {{time}}.",
      html_body: `
        <p><strong>Updated Appointment</strong></p>
        <p>Patient: {{patientName}}</p>
        <p>Email: {{patientEmail}}</p>
        <p>Phone: {{patientPhone}}</p>
        <p>Service: {{service}}</p>
        <p>New Date/Time: {{date}} at {{time}}</p>
        {{#if patientNote}}<p><em>Note: {{patientNote}}</em></p>{{/if}}
        <p>Appointment ID: {{appointmentId}}</p>
      `,
    },

    // ✅ PROVIDER CANCELLATION
    {
      provider_id: providerId,
      template_type: "provider_cancellation",
      subject: "[Cancelled] {{patientName}} on {{date}} at {{time}}",
      body: "Cancelled appointment: {{patientName}} was scheduled for {{date}} at {{time}}.",
      html_body: `
        <p><strong>Cancelled Appointment</strong></p>
        <p>Patient: {{patientName}}</p>
        <p>Email: {{patientEmail}}</p>
        <p>Phone: {{patientPhone}}</p>
        <p>Service: {{service}}</p>
        <p>Was scheduled for: {{date}} at {{time}}</p>
        {{#if patientNote}}<p><em>Note: {{patientNote}}</em></p>{{/if}}
        <p>Appointment ID: {{appointmentId}}</p>
      `,
    },
  ];
}
