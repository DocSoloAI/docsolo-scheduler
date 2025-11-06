/**
 * Default email templates for new providers.
 * These seed into Supabase automatically for each new provider.
 * One consistent design for all — only {{announcement}} and provider details change.
 */

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
      body: `Your appointment is confirmed.

{{announcement}}

Your appointment with {{providerName}} is scheduled for:

{{date}} at {{time}}

Location: {{location}}

Change / Cancel Appointment: {{manageLink}}

If you have questions, call or text {{providerPhone}}.

Appointment ID: {{appointmentId}}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:500; color:#15803d; margin-bottom:1em;">
            Your appointment is confirmed.
          </h2>

          {{#if announcement}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 14px; border-radius:6px; margin:1em 0; font-size:0.9rem;">
              {{announcement}}
            </p>
          {{/if}}

          <p>Your appointment with <strong>{{providerName}}</strong> is scheduled for:</p>

          <p style="font-weight:600; margin:1em 0;">{{date}} at {{time}}</p>

          <p>Location: <strong>{{location}}</strong></p>

          <div style="margin: 16px 0;">
            <a href="{{manageLink}}"
              style="display:block; width:max-content; background:#2563eb; color:#fff;
              text-decoration:none; border-radius:6px; font-weight:600;
              padding:12px 20px; text-align:center;">
              Change / Cancel Appointment
            </a>
          </div>

          <p>If you have questions, call or text
            <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a>
          </p>

          <p style="margin-top:2em; font-size:0.85rem; color:#555;">
            Appointment ID: {{appointmentId}}<br/>
          </p>

          ${DISCLAIMER_HTML}
        </div>
      `,
    },

    // ✅ REMINDER
    {
      provider_id: providerId,
      template_type: "reminder",
      subject: "Upcoming appointment reminder with {{providerName}}",
      body: `Upcoming appointment reminder

{{announcement}}

You have an appointment with {{providerName}} scheduled for:

{{date}} at {{time}}

Location: {{location}}

Change / Cancel Appointment: {{manageLink}}

If you have questions, call or text {{providerPhone}}.

Appointment ID: {{appointmentId}}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:500; color:#2563eb; margin-bottom:1em;">
            Upcoming appointment reminder
          </h2>

          {{#if announcement}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 14px; border-radius:6px; margin:1em 0; font-size:0.9rem;">
              {{announcement}}
            </p>
          {{/if}}

          <p>You have an appointment with <strong>{{providerName}}</strong> scheduled for:</p>

          <p style="font-weight:600; margin:1em 0;">{{date}} at {{time}}</p>

          <p>Location: <strong>{{location}}</strong></p>

          <div style="margin: 16px 0;">
            <a href="{{manageLink}}"
              style="display:block; width:max-content; background:#2563eb; color:#fff;
              text-decoration:none; border-radius:6px; font-weight:600;
              padding:12px 20px; text-align:center;">
              Change / Cancel Appointment
            </a>
          </div>

          <p>If you have questions, call or text
            <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a>
          </p>

          <p style="margin-top:2em; font-size:0.85rem; color:#555;">
            Appointment ID: {{appointmentId}}<br/>
          </p>

          ${DISCLAIMER_HTML}
        </div>
      `,
    },

    // ✅ UPDATE
    {
      provider_id: providerId,
      template_type: "update",
      subject: "Your appointment details have changed",
      body: `Your appointment details have changed.

{{announcement}}

Your appointment with {{providerName}} has been updated:

{{date}} at {{time}}

Location: {{location}}

Change / Cancel Appointment: {{manageLink}}

If you have questions, call or text {{providerPhone}}.

Appointment ID: {{appointmentId}}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:500; color:#f59e0b; margin-bottom:1em;">
            Your appointment details have changed.
          </h2>

          {{#if announcement}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 14px; border-radius:6px; margin:1em 0; font-size:0.9rem;">
              {{announcement}}
            </p>
          {{/if}}

          <p>Your appointment with <strong>{{providerName}}</strong> has been updated:</p>

          <p style="font-weight:600; margin:1em 0;">{{date}} at {{time}}</p>

          <p>Location: <strong>{{location}}</strong></p>

          <div style="margin: 16px 0;">
            <a href="{{manageLink}}"
              style="display:block; width:max-content; background:#2563eb; color:#fff;
              text-decoration:none; border-radius:6px; font-weight:600;
              padding:12px 20px; text-align:center;">
              Change / Cancel Appointment
            </a>
          </div>

          <p>If you have questions, call or text
            <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a>
          </p>

          <p style="margin-top:2em; font-size:0.85rem; color:#555;">
            Appointment ID: {{appointmentId}}<br/>
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
      body: `Your appointment has been cancelled.

{{announcement}}

The appointment scheduled for {{date}} at {{time}} has been cancelled.

If you'd like to schedule another appointment, visit: https://{{subdomain}}.bookthevisit.com

Questions? Call or text {{providerPhone}}.

Appointment ID: {{appointmentId}}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:500; color:#dc2626; margin-bottom:1em;">
            Your appointment has been cancelled.
          </h2>

          {{#if announcement}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 14px; border-radius:6px; margin:1em 0; font-size:0.9rem;">
              {{announcement}}
            </p>
          {{/if}}

          <p>The appointment scheduled for <strong>{{date}} at {{time}}</strong> has been cancelled.</p>

          <p>If you'd like to schedule another appointment, use the link below:</p>

          <p>
            <a href="https://{{subdomain}}.bookthevisit.com"
              style="display:inline-block; margin-top:1em; padding:10px 16px; background:#2563eb; color:#fff;
              text-decoration:none; border-radius:6px; font-weight:600;">
              Book Another Appointment
            </a>
          </p>

          <p style="margin-top:2em; font-size:0.85rem; color:#555;">
            Appointment ID: {{appointmentId}}<br/>
            Questions? Call or text
            <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a><br/>
          </p>

          ${DISCLAIMER_HTML}
        </div>
      `,
    },

    // ✅ PROVIDER NOTIFICATIONS
    {
      provider_id: providerId,
      template_type: "provider_confirmation",
      subject: "[New Appointment] {{patientName}} – {{date}} at {{time}}",
      body: `
    New Appointment
    Patient: {{patientName}}
    Email: {{patientEmail}}
    Phone: {{patientPhone}}
    Service: {{service}}
    Date/Time: {{date}} at {{time}}
    {{#if patientNote}}Notes from patient: "{{patientNote}}"{{/if}}
    Appointment ID: {{appointmentId}}
      `,
      html_body: `
    <p><strong>New Appointment</strong></p>
    <p>Patient: {{patientName}}</p>
    <p>Email: {{patientEmail}}</p>
    <p>Phone: {{patientPhone}}</p>
    <p>Service: {{service}}</p>
    <p>Date/Time: {{date}} at {{time}}</p>
    {{#if patientNote}}<p><em>Notes from patient:</em> "{{patientNote}}"</p>{{/if}}
    <p>Appointment ID: {{appointmentId}}</p>
      `,
    },
    {
      provider_id: providerId,
      template_type: "provider_update",
      subject: "[Updated Appointment] {{patientName}} – {{date}} at {{time}}",
      body: `
    Updated Appointment
    Patient: {{patientName}}
    Email: {{patientEmail}}
    Phone: {{patientPhone}}
    Service: {{service}}
    New Date/Time: {{date}} at {{time}}
    {{#if patientNote}}Notes from patient: "{{patientNote}}"{{/if}}
    Appointment ID: {{appointmentId}}
      `,
      html_body: `
    <p><strong>Updated Appointment</strong></p>
    <p>Patient: {{patientName}}</p>
    <p>Email: {{patientEmail}}</p>
    <p>Phone: {{patientPhone}}</p>
    <p>Service: {{service}}</p>
    <p>New Date/Time: {{date}} at {{time}}</p>
    {{#if patientNote}}<p><em>Notes from patient:</em> "{{patientNote}}"</p>{{/if}}
    <p>Appointment ID: {{appointmentId}}</p>
      `,
    },
    {
      provider_id: providerId,
      template_type: "provider_cancellation",
      subject: "[Cancelled Appointment] {{patientName}} – {{date}} at {{time}}",
      body: `
    Cancelled Appointment
    Patient: {{patientName}}
    Email: {{patientEmail}}
    Phone: {{patientPhone}}
    Service: {{service}}
    Was scheduled for: {{date}} at {{time}}
    {{#if patientNote}}Notes from patient: "{{patientNote}}"{{/if}}
    Appointment ID: {{appointmentId}}
      `,
      html_body: `
    <p><strong>Cancelled Appointment</strong></p>
    <p>Patient: {{patientName}}</p>
    <p>Email: {{patientEmail}}</p>
    <p>Phone: {{patientPhone}}</p>
    <p>Service: {{service}}</p>
    <p>Was scheduled for: {{date}} at {{time}}</p>
    {{#if patientNote}}<p><em>Notes from patient:</em> "{{patientNote}}"</p>{{/if}}
    <p>Appointment ID: {{appointmentId}}</p>
      `,
    },
  ];
}