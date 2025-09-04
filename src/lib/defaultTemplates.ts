/**
 * Default email templates for new providers.
 * Called during sign-up or when seeding missing templates.
 */

export function defaultTemplates(providerId: string) {
  return [
    // ✅ CONFIRMATION
    {
      provider_id: providerId,
      template_type: "confirmation",
      subject: "Appointment confirmed with {{providerName}} on {{date}} at {{time}}",
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: auto; color: #111;">
          <h2 style="font-size: 1rem; font-weight: 500; color: #15803d; margin-bottom: 1em;">
            Your appointment is confirmed.
          </h2>

          <p>Your appointment with <strong>{{providerName}}</strong> is scheduled for:</p>

          <p style="font-weight: 600; margin: 1em 0;">
            {{date}} at {{time}}
          </p>

          <p>
            Location: <strong>{{location}}</strong><br />
            If you have questions, call or text <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a>
          </p>

          <p>
            <a href="{{manageLink}}" 
              style="display: inline-block; margin-top: 1em; padding: 10px 16px; background: #2563eb; color: #fff;
              text-decoration: none; border-radius: 6px; font-weight: 600;">
              Manage Appointment
            </a>
          </p>

          <p style="margin-top: 2em; font-size: 0.85rem; color: #555;">
            Appointment ID: {{appointmentId}}
          </p>
        </div>
      `,
    },

    // ✅ REMINDER
    {
      provider_id: providerId,
      template_type: "reminder",
      subject: "Reminder: your appointment with {{providerName}}",
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: auto; color: #111;">
          <h2 style="font-size: 1rem; font-weight: 500; color: #2563eb; margin-bottom: 1em;">
            Upcoming appointment reminder
          </h2>

          <p>You have an appointment with <strong>{{providerName}}</strong> scheduled for:</p>

          <p style="font-weight: 600; margin: 1em 0;">
            {{date}} at {{time}}
          </p>

          <p>
            Location: <strong>{{location}}</strong><br />
            If you need to reschedule or cancel, use the link below.
          </p>

          <p>
            <a href="{{manageLink}}" 
              style="display: inline-block; margin-top: 1em; padding: 10px 16px; background: #2563eb; color: #fff;
              text-decoration: none; border-radius: 6px; font-weight: 600;">
              Manage Appointment
            </a>
          </p>

          <p style="margin-top: 2em; font-size: 0.85rem; color: #555;">
            Appointment ID: {{appointmentId}}
          </p>
        </div>
      `,
    },

    // ✅ CANCELLATION
    {
      provider_id: providerId,
      template_type: "cancellation",
      subject: "Appointment cancelled: {{date}} at {{time}}",
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: auto; color: #111;">
          <h2 style="font-size: 1rem; font-weight: 500; color: #dc2626; margin-bottom: 1em;">
            Your appointment has been cancelled.
          </h2>

          <p>The appointment scheduled for <strong>{{date}} at {{time}}</strong> has been cancelled.</p>

          <p>If you'd like to reschedule, use the link below:</p>

          <p>
            <a href="{{manageLink}}" 
              style="display: inline-block; margin-top: 1em; padding: 10px 16px; background: #dc2626; color: #fff;
              text-decoration: none; border-radius: 6px; font-weight: 600;">
              Reschedule Appointment
            </a>
          </p>

          <p style="margin-top: 2em; font-size: 0.85rem; color: #555;">
            Questions? Call or text {{providerPhone}}.
          </p>
        </div>
      `,
    },

    // ✅ UPDATE
    {
      provider_id: providerId,
      template_type: "update",
      subject: "Updated appointment with {{providerName}}",
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: auto; color: #111;">
          <h2 style="font-size: 1rem; font-weight: 500; color: #f59e0b; margin-bottom: 1em;">
            Your appointment details have changed.
          </h2>

          <p>Your appointment with <strong>{{providerName}}</strong> has been updated:</p>

          <p style="font-weight: 600; margin: 1em 0;">
            {{date}} at {{time}}
          </p>

          <p>
            Location: <strong>{{location}}</strong><br />
            If you have questions, call or text <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a>
          </p>

          <p>
            <a href="{{manageLink}}" 
              style="display: inline-block; margin-top: 1em; padding: 10px 16px; background: #2563eb; color: #fff;
              text-decoration: none; border-radius: 6px; font-weight: 600;">
              View Appointment
            </a>
          </p>

          <p style="margin-top: 2em; font-size: 0.85rem; color: #555;">
            Appointment ID: {{appointmentId}}
          </p>
        </div>
      `,
    },
  ];
}
