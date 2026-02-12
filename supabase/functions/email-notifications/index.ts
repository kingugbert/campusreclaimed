// Supabase Edge Function: email-notifications
// Checks for items 30+ days old and sends email notifications to donors
// Deploy: supabase functions deploy email-notifications

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

    // Find items that are 30+ days old, have an email, and haven't been notified
    const { data: items, error } = await supabaseClient
      .from('inventory_items')
      .select('*')
      .lte('date_accepted', thirtyDaysAgoStr)
      .not('donor_email', 'is', null)
      .is('notification_sent', null)

    if (error) throw error

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No items to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured')
    }

    const emailResults = []

    for (const item of items) {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: Deno.env.get('EMAIL_FROM') || 'noreply@yourdomain.com',
            to: item.donor_email,
            subject: 'Item Donation Status Update — 30 Days',
            html: `
              <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #d97706; margin-bottom: 16px;">Donation Inventory Update</h2>
                <p>Dear ${item.donor_name},</p>
                <p>This is a reminder that it has been 30 days since you donated the following item:</p>
                <div style="background-color: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 4px 0;"><strong>Item:</strong> ${item.item_description}</p>
                  <p style="margin: 4px 0;"><strong>Date Accepted:</strong> ${item.date_accepted}</p>
                  <p style="margin: 4px 0;"><strong>Storage Location:</strong> ${item.storage_location}</p>
                </div>
                <p>Thank you for your generous donation!</p>
                <p>Best regards,<br/>${Deno.env.get('ORG_NAME') || 'Your Organization'}</p>
              </div>
            `
          })
        })

        if (emailResponse.ok) {
          await supabaseClient
            .from('inventory_items')
            .update({ notification_sent: new Date().toISOString() })
            .eq('id', item.id)

          emailResults.push({ id: item.id, donor: item.donor_name, status: 'sent' })
        } else {
          const errText = await emailResponse.text()
          console.error(`Email failed for ${item.id}:`, errText)
          emailResults.push({ id: item.id, donor: item.donor_name, status: 'failed', error: errText })
        }
      } catch (emailError) {
        console.error('Email error for item', item.id, emailError)
        emailResults.push({ id: item.id, donor: item.donor_name, status: 'failed', error: emailError.message })
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${items.length} items`,
        results: emailResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
