import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('Function invoked:', req.method, req.url)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // Check API key first
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    console.log('API key present:', !!anthropicKey, 'length:', anthropicKey?.length)

    if (!anthropicKey) {
      console.error('ANTHROPIC_API_KEY secret is not set')
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    let body
    try {
      body = await req.json()
      console.log('Request body received, base64 length:', body?.base64?.length, 'mediaType:', body?.mediaType)
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

    console.log('Calling Anthropic API...')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        system: `You are an expert at identifying donated items for a sustainable fashion and furniture resale shop called Campus Reclaimed. Analyze the image and return ONLY a JSON object — no explanation, no markdown, no code fences.

The JSON must follow this exact schema:
{
  "category": one of ["Clothing", "Furniture", "Electronics", "Books", "Kitchen", "Bedding", "Desk & Study", "Other"],
  "description": a short 1-sentence description of the item,
  "metadata": {
    only include fields you can confidently identify
  }
}

Valid values for each metadata field:
CLOTHING: subcategory ("Tops & Shirts","Bottoms (Pants/Jeans/Shorts)","Dresses","Outerwear (Coats/Jackets)","Activewear","Sweaters & Hoodies","Suits & Blazers","Sleepwear & Loungewear","Swimwear","Underwear & Socks","One-Pieces & Jumpsuits","Skirts"), gender ("Women","Men","Unisex","Girls","Boys"), age_group ("Adults","Teens","Kids","Toddlers","Babies"), size ("XXS","XS","S","M","L","XL","XXL","XXXL","4XL","5XL","6XL","One Size","Other"), color (free text), brand (free text), fabric ("Cotton","Polyester","Wool","Silk","Denim","Linen","Rayon/Viscose","Nylon","Cashmere","Fleece","Acrylic","Spandex/Lycra","Blend","Other"), condition ("New with tags","Like New","Good","Fair","Worn")
FURNITURE: subcategory ("Chair","Sofa / Loveseat","Sectional","Table (Dining)","Table (Coffee/End)","Desk","Dresser / Chest","Bed Frame","Bookcase / Shelving","Cabinet / Storage","Nightstand","Ottoman","Bench","Office Chair","Other"), color (free text), material ("Wood (Solid)","Wood (Engineered/MDF)","Metal","Upholstered (Fabric)","Upholstered (Leather)","Upholstered (Faux Leather)","Upholstered (Velvet)","Wicker / Rattan","Glass","Plastic","Mixed Materials"), style ("Modern","Mid-Century Modern","Traditional","Industrial","Rustic / Farmhouse","Scandinavian / Minimalist","Bohemian","Coastal","Contemporary","Other"), dimensions (free text), condition ("Like New","Good — minor wear","Fair — visible wear","Poor — needs repair"), notes (free text)`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } },
            { type: 'text', text: 'Identify this donated item and return the JSON metadata.' }
          ]
        }]
      })
    })

    console.log('Anthropic response status:', response.status)
    const data = await response.json()
    console.log('Anthropic response:', JSON.stringify(data).slice(0, 200))

    if (!response.ok) {
      console.error('Anthropic API error:', JSON.stringify(data))
      return new Response(JSON.stringify({ error: 'Anthropic API error', detail: data }), {
        status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    const text = data.content?.[0]?.text || ''
    console.log('Raw text from Claude:', text.slice(0, 300))

    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    console.log('Parsed result:', JSON.stringify(parsed))

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
