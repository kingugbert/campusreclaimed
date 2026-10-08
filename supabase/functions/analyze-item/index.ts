// supabase/functions/analyze-item/index.ts
// Identifies a donated item from a photo and returns structured category +
// metadata JSON for the intake form.
//
// Auth: requires a signed-in staff user (validated via auth.getUser) since
// this deploys --no-verify-jwt and every call costs Anthropic API credits.
//
// Deploy: supabase functions deploy analyze-item --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ~5MB binary is Anthropic's image ceiling; base64 inflates ~4/3.
const MAX_BASE64_LENGTH = 7_000_000;

const SYSTEM_PROMPT = `You are an expert at identifying donated items for a sustainable fashion and furniture resale shop called Campus Reclaimed. Analyze the image and return ONLY a JSON object — no explanation, no markdown, no code fences.

The JSON must follow this exact schema:
{
  "category": one of ["Clothing", "Furniture", "Electronics", "Books", "Headboards", "Kitchen", "Bedding", "Desk & Study", "Other"],
  "description": a short 1-sentence description of the item,
  "metadata": {
    only include fields you can confidently identify
  }
}

A bed headboard on its own (not attached to a full bed frame) is category "Headboards", not "Furniture".

Valid values for each metadata field:
CLOTHING: subcategory ("Tops & Shirts","Bottoms (Pants/Jeans/Shorts)","Dresses","Outerwear (Coats/Jackets)","Activewear","Sweaters & Hoodies","Suits & Blazers","Sleepwear & Loungewear","Swimwear","Underwear & Socks","One-Pieces & Jumpsuits","Skirts"), gender ("Women","Men","Unisex","Girls","Boys"), age_group ("Adults","Teens","Kids","Toddlers","Babies"), size ("XXS","XS","S","M","L","XL","XXL","XXXL","4XL","5XL","6XL","One Size","Other"), color (free text), brand (free text), fabric ("Cotton","Polyester","Wool","Silk","Denim","Linen","Rayon/Viscose","Nylon","Cashmere","Fleece","Acrylic","Spandex/Lycra","Blend","Other"), condition ("New with tags","Like New","Good","Fair","Worn")
FURNITURE: subcategory ("Chair","Sofa / Loveseat","Sectional","Table (Dining)","Table (Coffee/End)","Desk","Dresser / Chest","Bed Frame","Bookcase / Shelving","Cabinet / Storage","Nightstand","Ottoman","Bench","Office Chair","Other"), color (free text), material ("Wood (Solid)","Wood (Engineered/MDF)","Metal","Upholstered (Fabric)","Upholstered (Leather)","Upholstered (Faux Leather)","Upholstered (Velvet)","Wicker / Rattan","Glass","Plastic","Mixed Materials"), style ("Modern","Mid-Century Modern","Traditional","Industrial","Rustic / Farmhouse","Scandinavian / Minimalist","Bohemian","Coastal","Contemporary","Other"), dimensions (free text), condition ("Like New","Good — minor wear","Fair — visible wear","Poor — needs repair"), notes (free text)
HEADBOARDS: subcategory ("Panel / Flat","Tufted","Slatted / Wood","Upholstered","Bookcase / Storage","Metal / Wrought Iron","Arched","Floating / Wall-Mounted","Other"), color (free text), material ("Wood (Solid)","Wood (Engineered/MDF)","Metal","Upholstered (Fabric)","Upholstered (Leather)","Upholstered (Faux Leather)","Upholstered (Velvet)","Wicker / Rattan","Mixed Materials"), style ("Modern","Mid-Century Modern","Traditional","Industrial","Rustic / Farmhouse","Scandinavian / Minimalist","Bohemian","Coastal","Contemporary","Other"), dimensions (free text), condition ("Like New","Good — minor wear","Fair — visible wear","Poor — needs repair"), notes (free text)`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('ANTHROPIC_API_KEY secret is not set')
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    // ── Require a signed-in staff user (this endpoint spends API credits) ──
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized — staff sign-in required' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    let body
    try {
      body = await req.json()
    } catch (e) {
      console.error('Failed to parse request body:', e)
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    const { base64, mediaType } = body

    if (!base64) {
      return new Response(JSON.stringify({ error: 'No image data provided' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }
    if (base64.length > MAX_BASE64_LENGTH) {
      return new Response(JSON.stringify({ error: 'Image too large for analysis (max ~5MB). Try a smaller photo.' }), {
        status: 413, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Analyzing image (${Math.round(base64.length / 1024)}KB base64) for ${userData.user.email}`)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } },
            { type: 'text', text: 'Identify this donated item and return the JSON metadata.' }
          ]
        }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic API error:', JSON.stringify(data).slice(0, 500))
      return new Response(JSON.stringify({ error: 'Anthropic API error', detail: data }), {
        status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    const text = data.content?.[0]?.text || ''
    const clean = text.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch (_) {
      console.error('Failed to parse model output as JSON:', text.slice(0, 300))
      return new Response(JSON.stringify({ error: 'Could not parse analysis result' }), {
        status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    console.log('Parsed result:', JSON.stringify(parsed).slice(0, 300))

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Unhandled error:', err.message, err.stack)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})
