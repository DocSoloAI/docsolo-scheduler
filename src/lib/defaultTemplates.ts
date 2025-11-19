/**
 * Default email templates for new providers.
 * These seed into Supabase automatically for each new provider.
 * One consistent design for all — only {{announcement}} and provider details change.
 */

export function defaultTemplates(providerId: string) {
  return [
    // ✅ CONFIRMATION
    {
      provider_id: providerId,
      template_type: "confirmation",
      subject: "Appointment confirmed with {{providerName}} on {{date}} at {{time}}",
      body: `Your appointment is confirmed for {{date}} at {{time}}.

  {{announcement}}

  Location: {{location}}

  Change / Cancel Appointment: {{manageLink}}

  If you have questions, call or text {{providerPhone}}.

  Appointment ID: {{appointmentId}}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:600; color:#15803d; margin-bottom:1.2em;">
            Your appointment is confirmed
          </h2>

          {{#if announcement}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 14px; border-radius:6px;
              margin:1em 0; font-size:0.9rem; line-height:1.4;">
              {{announcement}}
            </p>
          {{/if}}

          <p style="font-size:1rem; font-weight:600; margin:1em 0 1.5em;">
            {{date}} at {{time}}
          </p>

          <div style="margin: 16px 0;">
            <a href="{{manageLink}}"
              style="display:inline-block; background:#2563eb; color:#fff;
              text-decoration:none; border-radius:6px; font-weight:600;
              padding:12px 24px;">
              Change / Cancel Appointment
            </a>
          </div>

          <p style="margin:1.5em 0 0.25em; font-size:0.9rem; color:#555;">Location:</p>
          <p style="font-size:0.95rem; font-weight:500; line-height:1.4;">
            <strong>{{providerName}}</strong><br/>
            {{location}}
          </p>

          <p style="margin-top:1.2em; font-size:0.8rem; color:#666;">
            Note: To make changes to other visits, use the link from each appointment email.
          </p>

          <p style="margin-top:1.5em; font-size:0.9rem; color:#555;">
            If you have questions, call or text
            <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a>
          </p>

          <p style="margin-top:2em; font-size:0.8rem; color:#777;">
            Appointment ID: {{appointmentId}}<br/>
            No-show appointments may be billed by your provider.
          </p>
        </div>
      `,
    },
    // 🔵 REMINDER
    {
      provider_id: providerId,
      template_type: "reminder",
      subject: "Reminder: your appointment with {{providerName}} is tomorrow at {{time}}",
      body: `This is a friendly reminder for your appointment on {{date}} at {{time}}.

  {{announcement}}

  Location: {{location}}

  Change / Cancel Appointment: {{manageLink}}

  If you have questions, call or text {{providerPhone}}.

  Appointment ID: {{appointmentId}}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:600; color:#2563eb; margin-bottom:1.2em;">
            Upcoming appointment reminder
          </h2>

          {{#if announcement}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 14px; border-radius:6px;
              margin:1em 0; font-size:0.9rem; line-height:1.4;">
              {{announcement}}
            </p>
          {{/if}}

          <p style="font-size:1rem; font-weight:600; margin:1em 0 1.5em;">
            {{date}} at {{time}}
          </p>

          <div style="margin: 16px 0;">
            <a href="{{manageLink}}"
              style="display:inline-block; background:#2563eb; color:#fff;
              text-decoration:none; border-radius:6px; font-weight:600;
              padding:12px 24px;">
              Change / Cancel Appointment
            </a>
          </div>

          <p style="margin:1.5em 0 0.25em; font-size:0.9rem; color:#555;">Location:</p>
          <p style="font-size:0.95rem; font-weight:500; line-height:1.4;">
            <strong>{{providerName}}</strong><br/>
            {{location}}
          </p>

          <p style="margin-top:1.2em; font-size:0.8rem; color:#666;">
            Note: To make changes to other visits, use the link from each appointment email.
          </p>

          <p style="margin-top:1.5em; font-size:0.9rem; color:#555;">
            If you have questions, call or text
            <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a>
          </p>

          <p style="margin-top:2em; font-size:0.8rem; color:#777;">
            Appointment ID: {{appointmentId}}<br/>
            No-show appointments may be billed by your provider.
          </p>
        </div>
      `,
    },
    // 🟡 UPDATE
    {
      provider_id: providerId,
      template_type: "update",
      subject: "Your appointment details have changed",
      body: `Your appointment details have been updated.

  {{announcement}}

  New date/time: {{date}} at {{time}}

  Location: {{location}}

  Change / Cancel Appointment: {{manageLink}}

  If you have questions, call or text {{providerPhone}}.

  Appointment ID: {{appointmentId}}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:600; color:#f59e0b; margin-bottom:1.2em;">
            Your appointment details have changed
          </h2>

          {{#if announcement}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 14px; border-radius:6px;
              margin:1em 0; font-size:0.9rem; line-height:1.4;">
              {{announcement}}
            </p>
          {{/if}}

          <p style="font-size:1rem; font-weight:600; margin:1em 0 1.5em;">
            {{date}} at {{time}}
          </p>

          <div style="margin: 16px 0;">
            <a href="{{manageLink}}"
              style="display:inline-block; background:#2563eb; color:#fff;
              text-decoration:none; border-radius:6px; font-weight:600;
              padding:12px 24px;">
              Change / Cancel Appointment
            </a>
          </div>

          <p style="margin:1.5em 0 0.25em; font-size:0.9rem; color:#555;">Location:</p>
          <p style="font-size:0.95rem; font-weight:500; line-height:1.4;">
            <strong>{{providerName}}</strong><br/>
            {{location}}
          </p>

          <p style="margin-top:1.2em; font-size:0.8rem; color:#666;">
            Note: To make changes to other visits, use the link from each appointment email.
          </p>

          <p style="margin-top:1.5em; font-size:0.9rem; color:#555;">
            If you have questions, call or text
            <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a>
          </p>

          <p style="margin-top:2em; font-size:0.8rem; color:#777;">
            Appointment ID: {{appointmentId}}<br/>
            No-show appointments may be billed by your provider.
          </p>
        </div>
      `,
    },
    // 🔴 CANCELLATION
    {
      provider_id: providerId,
      template_type: "cancellation",
      subject: "Appointment cancelled: {{date}} at {{time}}",
      body: `Your appointment scheduled for {{date}} at {{time}} has been cancelled.

  {{announcement}}

  If you'd like to schedule another appointment, visit: https://{{subdomain}}.bookthevisit.com

  Questions? Call or text {{providerPhone}}.

  Appointment ID: {{appointmentId}}`,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:600; color:#dc2626; margin-bottom:1.2em;">
            Your appointment has been cancelled
          </h2>

          {{#if announcement}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 14px; border-radius:6px;
              margin:1em 0; font-size:0.9rem; line-height:1.4;">
              {{announcement}}
            </p>
          {{/if}}

          <p style="font-size:1rem; font-weight:500; margin:1em 0 1.5em;">
            {{date}} at {{time}}
          </p>

          <p style="margin:1.5em 0; font-size:0.95rem;">
            If you'd like to schedule another appointment, click below:
          </p>

          <div style="margin: 16px 0;">
            <a href="https://{{subdomain}}.bookthevisit.com"
              style="display:inline-block; background:#2563eb; color:#fff;
              text-decoration:none; border-radius:6px; font-weight:600;
              padding:12px 24px;">
              Book Another Appointment
            </a>
          </div>

          <p style="margin-top:1.5em; font-size:0.9rem; color:#555;">
            Questions? Call or text
            <a href="tel:{{providerPhone}}" style="color:#2563eb;">{{providerPhone}}</a>
          </p>

          <p style="margin-top:2em; font-size:0.8rem; color:#777;">
            Appointment ID: {{appointmentId}}<br/>
            No-show appointments may be billed by your provider.
          </p>
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

    {{#if address.street}}
    Address:
      {{address.street}}
      {{address.city}}, {{address.state}} {{address.zip}}
    {{/if}}

    {{#if insurance.primaryInsurance}}
    Primary Insurance:
      Company: {{insurance.primaryInsurance}}
      ID: {{insurance.primaryID}}
    {{/if}}

    {{#if insurance.secondaryInsurance}}
    Secondary Insurance:
      Company: {{insurance.secondaryInsurance}}
      ID: {{insurance.secondaryID}}
    {{/if}}

    {{#if patientNote}}Notes from patient: "{{patientNote}}"{{/if}}

    Appointment ID: {{appointmentId}}
      `,
      html_body: `
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:600; color:#15803d; margin-bottom:1em;">New Appointment</h2>
          <p><strong>Patient:</strong> {{patientName}}</p>
          <p><strong>Email:</strong> {{patientEmail}}</p>
          <p><strong>Phone:</strong> {{patientPhone}}</p>
          <p><strong>Service:</strong> {{service}}</p>
          <p><strong>Date/Time:</strong> {{date}} at {{time}}</p>

          {{#if address.street}}
            <p style="margin-top:1em;">
              <strong>Address:</strong><br/>
              {{address.street}}<br/>
              {{address.city}}, {{address.state}} {{address.zip}}
            </p>
          {{/if}}

          {{#if insurance.primaryInsurance}}
            <p style="margin-top:1em;">
              <strong>Primary Insurance:</strong><br/>
              Company: {{insurance.primaryInsurance}}<br/>
              ID: {{insurance.primaryID}}
            </p>
          {{/if}}

          {{#if insurance.secondaryInsurance}}
            <p style="margin-top:1em;">
              <strong>Secondary Insurance:</strong><br/>
              Company: {{insurance.secondaryInsurance}}<br/>
              ID: {{insurance.secondaryID}}
            </p>
          {{/if}}

          {{#if patientNote}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 12px;
              border-radius:6px; margin-top:1em; font-size:0.9rem;">
              <strong>Patient Note:</strong> "{{patientNote}}"
            </p>
          {{/if}}

          <p style="margin-top:1.5em; font-size:0.8rem; color:#777;">Appointment ID: {{appointmentId}}</p>
        </div>
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
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:600; color:#f59e0b; margin-bottom:1em;">Updated Appointment</h2>
          <p><strong>Patient:</strong> {{patientName}}</p>
          <p><strong>Email:</strong> {{patientEmail}}</p>
          <p><strong>Phone:</strong> {{patientPhone}}</p>
          <p><strong>Service:</strong> {{service}}</p>
          <p><strong>New Date/Time:</strong> {{date}} at {{time}}</p>
          {{#if patientNote}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 12px; border-radius:6px; margin-top:1em; font-size:0.9rem;">
              <strong>Patient Note:</strong> "{{patientNote}}"
            </p>
          {{/if}}
          <p style="margin-top:1.5em; font-size:0.8rem; color:#777;">Appointment ID: {{appointmentId}}</p>
        </div>
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
        <div style="font-family: system-ui, sans-serif; max-width:600px; margin:auto; color:#111;">
          <h2 style="font-size:1rem; font-weight:600; color:#dc2626; margin-bottom:1em;">Cancelled Appointment</h2>
          <p><strong>Patient:</strong> {{patientName}}</p>
          <p><strong>Email:</strong> {{patientEmail}}</p>
          <p><strong>Phone:</strong> {{patientPhone}}</p>
          <p><strong>Service:</strong> {{service}}</p>
          <p><strong>Was scheduled for:</strong> {{date}} at {{time}}</p>
          {{#if patientNote}}
            <p style="background:#fef3c7; color:#92400e; padding:10px 12px; border-radius:6px; margin-top:1em; font-size:0.9rem;">
              <strong>Patient Note:</strong> "{{patientNote}}"
            </p>
          {{/if}}
          <p style="margin-top:1.5em; font-size:0.8rem; color:#777;">Appointment ID: {{appointmentId}}</p>
        </div>
      `,
    },
  ];
}