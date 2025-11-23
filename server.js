// server.js
// Dynamic Pricing AI Backend (OpenAI + Shopify + MailerLite)

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000; // you’ve been using 4000

// ---- Environment variables ----
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const MAILERLITE_API_KEY = process.env.MAILERLITE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

// ✅ Max number of customers to analyze (to avoid timeouts / huge prompts)
// Default is 1000, override with MAX_CUSTOMERS_ANALYZED in .env if needed
const MAX_CUSTOMERS_ANALYZED = Number(
  process.env.MAX_CUSTOMERS_ANALYZED || '1000'
);

// ✅ Max customers we send to OpenAI in a single analysis call
// (Keeps prompts fast & cheap)
const MAX_CUSTOMERS_FOR_AI = Number(
  process.env.MAX_CUSTOMERS_FOR_AI || '250'
);

// ---- OpenAI client ----
const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Middleware
app.use(cors());

// Allow larger JSON + urlencoded payloads (for big customer segments)
app.use(
  express.json({
    limit: '5mb',
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '5mb',
  })
);

// --------------------------------------------------
// Health check endpoint
// --------------------------------------------------
app.get('/api/health', (req, res) => {
  const missingEnv = [];
  if (!OPENAI_API_KEY) missingEnv.push('OPENAI_API_KEY');
  if (!SHOPIFY_STORE) missingEnv.push('SHOPIFY_STORE');
  if (!SHOPIFY_API_KEY) missingEnv.push('SHOPIFY_API_KEY');
  if (!MAILERLITE_API_KEY) missingEnv.push('MAILERLITE_API_KEY');

  res.json({
    status: 'ok',
    message: 'Dynamic Pricing AI Backend is running',
    hasOpenAIKey: !!OPENAI_API_KEY,
    hasShopifyKey: !!SHOPIFY_API_KEY,
    hasShopifyStore: !!SHOPIFY_STORE,
    hasMailerliteKey: !!MAILERLITE_API_KEY,
    shopifyStore: SHOPIFY_STORE || null,
    openaiModel: OPENAI_MODEL,
    maxCustomersAnalyzed: MAX_CUSTOMERS_ANALYZED,
    maxCustomersForAI: MAX_CUSTOMERS_FOR_AI,
    missingEnv,
  });
});

// --------------------------------------------------
// Helper: fetch customers from Shopify with pagination
// --------------------------------------------------
async function fetchShopifyCustomersPaginated(
  limitTotal = MAX_CUSTOMERS_ANALYZED
) {
  console.log('\n📄 Starting Shopify pagination fetch...');
  console.log(`➡️ Limit Total: ${limitTotal}`);

  const allCustomers = [];
  let pageInfo = null;
  let done = false;

  while (!done && allCustomers.length < limitTotal) {
    const perPage = Math.min(250, limitTotal - allCustomers.length);
    const baseUrl = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-10/customers.json`;
    const url = pageInfo
      ? `${baseUrl}?limit=${perPage}&page_info=${pageInfo}`
      : `${baseUrl}?limit=${perPage}`;

    console.log('-------------------------------------------');
    console.log(`➡️ Fetching page (current count: ${allCustomers.length})`);
    console.log(`URL: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const customers = data.customers || [];
    console.log(`📦 Customers received this page: ${customers.length}`);
    allCustomers.push(...customers);

    // Parse Link header for pagination
    const linkHeader = response.headers.get('link');
    if (!linkHeader) {
      done = true;
    } else {
      const links = linkHeader.split(',');
      const nextLink = links.find((l) => l.includes('rel="next"'));
      if (!nextLink) {
        done = true;
      } else {
        const match = nextLink.match(/page_info=([^&>]+)/);
        pageInfo = match ? match[1] : null;
        if (!pageInfo) done = true;
      }
    }
  }

  console.log(`\n✅ TOTAL RAW CUSTOMERS FETCHED: ${allCustomers.length}`);
  console.log('--------------------------------------------------------');

  return allCustomers.slice(0, limitTotal);
}

// --------------------------------------------------
// Fetch Shopify customers + basic metrics (NO per-customer orders API)
// --------------------------------------------------
app.get('/api/shopify/customers', async (req, res) => {
  try {
    console.log('\n==============================');
    console.log('📡  /api/shopify/customers HIT');
    console.log('==============================');
    console.log(`🔧 Shopify Store: ${SHOPIFY_STORE}`);
    console.log(`🔧 MAX_CUSTOMERS_ANALYZED: ${MAX_CUSTOMERS_ANALYZED}`);
    console.log('➡️ Fetching customers from Shopify with pagination…');

    if (!SHOPIFY_API_KEY || !SHOPIFY_STORE) {
      return res
        .status(400)
        .json({ error: 'Shopify credentials not configured' });
    }

    // 🔁 Use paginated fetch up to MAX_CUSTOMERS_ANALYZED
    const rawCustomers = await fetchShopifyCustomersPaginated(
      MAX_CUSTOMERS_ANALYZED
    );

    console.log(
      `\n🛒 RAW CUSTOMERS FROM SHOPIFY (Before Metrics): ${rawCustomers.length}`
    );
    if (rawCustomers.length > 0) {
      console.log('🔍 Sample Returned Customers (first 3):');
      console.log(JSON.stringify(rawCustomers.slice(0, 3), null, 2));
    }

    console.log('➡️ Computing metrics directly from customer objects…');

    // ✅ No per-customer /orders calls (avoids 429 rate limits)
    const customersWithMetrics = rawCustomers.map((customer) => {
      const totalOrders = Number(customer.orders_count || 0);
      const totalSpent = parseFloat(customer.total_spent || '0.00');

      const lastOrderDateRaw = customer.updated_at || customer.created_at;
      const lastOrderDate = lastOrderDateRaw
        ? new Date(lastOrderDateRaw)
        : null;

      const daysSinceLastOrder = lastOrderDate
        ? Math.floor(
            (Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        : 999;

      return {
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name || 'Customer',
        lastName: customer.last_name || '',
        totalOrders,
        totalSpent,
        averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
        daysSinceLastOrder,
        lastOrderDate,
        tags: customer.tags || '',
        state: customer.state || 'active',
      };
    });

    console.log(
      `✅ FINAL CUSTOMERS RETURNED TO FRONTEND: ${customersWithMetrics.length}`
    );

    res.json({
      customers: customersWithMetrics,
      total: customersWithMetrics.length,
      maxAnalyzed: MAX_CUSTOMERS_ANALYZED,
    });
  } catch (error) {
    console.error('Error fetching Shopify customers:', error);
    res.status(500).json({ error: error.message || 'Unknown error' });
  }
});

// --------------------------------------------------
// OpenAI analysis for dynamic pricing (sample segment)
// POST /api/ai/analyze
// --------------------------------------------------
app.post('/api/ai/analyze', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res
        .status(400)
        .json({ error: 'OpenAI API key (OPENAI_API_KEY) not configured' });
    }

    const { customerSegment, pricingStrategy, strategyInfo } = req.body || {};

    if (!Array.isArray(customerSegment) || customerSegment.length === 0) {
      return res.status(400).json({
        error: 'customerSegment must be a non-empty array',
      });
    }

    // 🔎 Sample down to MAX_CUSTOMERS_FOR_AI for OpenAI prompt
    let segment = customerSegment;
    if (segment.length > MAX_CUSTOMERS_FOR_AI) {
      console.log(
        `AI analyze: received ${segment.length} customers, sampling first ${MAX_CUSTOMERS_FOR_AI}`
      );
      segment = segment.slice(0, MAX_CUSTOMERS_FOR_AI);
    }

    const strategyName = strategyInfo?.name || pricingStrategy || 'Unknown';
    const strategyDesc =
      strategyInfo?.description ||
      'No explicit strategy description was provided.';

    const systemPrompt = `
You are a pricing strategy AI for Daily N'Oats, a low-carb oatmeal alternative company.
You MUST ALWAYS respond with a single valid JSON object. Do NOT include explanations, markdown, or any text outside the JSON.
The word "JSON" appears here to satisfy tooling requirements.`;

    const userPrompt = `
CUSTOMER SEGMENT DATA (JSON):
${JSON.stringify(segment, null, 2)}

PRICING STRATEGY: ${strategyName}
STRATEGY GOAL: ${strategyDesc}

BUSINESS CONTEXT:
- Current monthly revenue: $12-15K
- Total customers: 8,000
- Active customers: 200
- Current ROAS: 1.3
- Product: Low-carb oatmeal alternative targeting keto and GLP-1 users

TASK:
Analyze this customer segment and provide:

1. Recommended discount percentage for each customer (0-40%)
2. Rationale for each discount level
3. Expected impact on conversion/retention
4. Personalized email messaging angle for each customer
5. Overall campaign ROI projection

RESPONSE FORMAT (STRICT JSON):

{
  "customerRecommendations": [
    {
      "customerId": "customer_id",
      "email": "customer@example.com",
      "discountPercent": 20,
      "discountCode": "COMEBACK20",
      "rationale": "explanation",
      "messagingAngle": "personalized message approach",
      "expectedValue": 45.50
    }
  ],
  "campaignProjection": {
    "expectedConversionRate": "15%",
    "projectedRevenue": "$2,500",
    "projectedROI": "3.2x",
    "riskFactors": ["factor1", "factor2"]
  },
  "strategicInsights": ["insight1", "insight2", "insight3"]
}

CRITICAL:
- Respond ONLY with valid JSON that matches this shape.
- Do NOT wrap the JSON in markdown.
- Do NOT add any keys other than the ones shown above, except where you need more detailed text in string fields.
`;

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('No content returned from OpenAI');
    }

    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse JSON from OpenAI response:', raw);
      throw new Error('OpenAI did not return valid JSON.');
    }

    res.json(analysis);
  } catch (error) {
    console.error('Error with OpenAI analysis:', error);
    res.status(500).json({ error: error.message || 'Unknown error' });
  }
});

// --------------------------------------------------
// PHASE 1 – GLP-1 Meal Planner – OpenAI endpoint
// POST /api/glp1/plan
// --------------------------------------------------
app.post('/api/glp1/plan', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(400).json({
        error: 'OpenAI API key (OPENAI_API_KEY) not configured',
      });
    }

    const {
      goal,                 // e.g. "weight_loss", "maintenance"
      dailyCalories,        // e.g. 1400
      mealsPerDay,          // e.g. 2 or 3
      dietaryRestrictions,  // e.g. "gluten-free, dairy-free"
      likes,                // e.g. "berries, eggs, avocado"
      dislikes,             // e.g. "tofu, mushrooms"
      scheduleNotes,        // e.g. "busy mornings, can cook on weekends"
      days                  // e.g. 3 or 7
    } = req.body || {};

    if (!goal || !dailyCalories || !mealsPerDay || !days) {
      return res.status(400).json({
        error: 'Missing required fields (goal, dailyCalories, mealsPerDay, days)',
      });
    }

    const systemPrompt = `
You are a GLP-1 informed nutrition coach for Daily N'Oats customers.
Create realistic, simple, GLP-1-friendly meal plans that:
- Are high protein, low sugar, and supportive of satiety
- Use accessible ingredients
- Respect the user's dietary restrictions and preferences
- Emphasize practical prep (batch cooking, leftovers, simple assembly)
Return your response as structured JSON only.`;

    const userPrompt = `
Create a ${days}-day GLP-1-friendly meal plan.

Goal: ${goal}
Daily calories target: ${dailyCalories}
Meals per day: ${mealsPerDay}

Dietary restrictions: ${dietaryRestrictions || 'none specified'}
Foods the user likes: ${likes || 'not specified'}
Foods the user dislikes: ${dislikes || 'not specified'}
Schedule / lifestyle notes: ${scheduleNotes || 'not specified'}

For each day, include:
- Day label (e.g., "Day 1")
- Each meal with: name, brief description, rough calories and protein estimate
- 1–2 snack ideas if appropriate
- 1 "GLP-1 coaching tip" for that day (hydration, protein, fiber, movement, etc.)

RESPONSE FORMAT (MUST be valid JSON):

{
  "meta": {
    "goal": "string",
    "dailyCalories": number,
    "mealsPerDay": number,
    "days": number,
    "notes": "string"
  },
  "days": [
    {
      "day": "Day 1",
      "coachingTip": "string",
      "meals": [
        {
          "type": "Breakfast",
          "name": "string",
          "description": "string",
          "calories": number,
          "proteinGrams": number
        }
      ],
      "snacks": [
        {
          "name": "string",
          "description": "string",
          "calories": number,
          "proteinGrams": number
        }
      ]
    }
  ],
  "summary": {
    "keyThemes": ["string"],
    "shoppingList": ["string"],
    "prepTips": ["string"]
  }
}

Return ONLY JSON. No markdown, no extra text.
`;

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('No content returned from OpenAI for GLP-1 planner');
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse JSON from OpenAI (GLP-1):', raw);
      throw new Error('OpenAI did not return valid JSON for GLP-1 planner.');
    }

    return res.json(parsed);
  } catch (err) {
    console.error('Error in /api/glp1/plan:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// --------------------------------------------------
// Create Shopify discount codes from AI recommendations
// --------------------------------------------------
app.post('/api/shopify/discounts', async (req, res) => {
  try {
    const { recommendations } = req.body;

    if (!SHOPIFY_API_KEY || !SHOPIFY_STORE) {
      return res
        .status(400)
        .json({ error: 'Shopify credentials not configured' });
    }

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return res
        .status(400)
        .json({ error: 'No recommendations provided to create discounts.' });
    }

    // Group recommendations by discount code to avoid duplicates
    const uniqueCodes = {};
    recommendations.forEach((rec) => {
      if (rec.discountCode && typeof rec.discountPercent === 'number') {
        if (!uniqueCodes[rec.discountCode]) {
          uniqueCodes[rec.discountCode] = rec.discountPercent;
        }
      }
    });

    const createdCodes = [];
    const failedCodes = [];

    for (const [code, percentage] of Object.entries(uniqueCodes)) {
      try {
        // Calculate expiration date (7 days from now)
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 7);

        const discountPayload = {
          price_rule: {
            title: `${code} - AI Dynamic Pricing`,
            target_type: 'line_item',
            target_selection: 'all',
            allocation_method: 'across',
            value_type: 'percentage',
            value: `-${percentage}`,
            customer_selection: 'all',
            once_per_customer: true,
            usage_limit: 1,
            starts_at: new Date().toISOString(),
            ends_at: expirationDate.toISOString(),
          },
        };

        // Create price rule
        const priceRuleResponse = await fetch(
          `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-10/price_rules.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(discountPayload),
          }
        );

        if (!priceRuleResponse.ok) {
          const errorData = await priceRuleResponse.json();
          throw new Error(
            `Price rule creation failed: ${JSON.stringify(errorData)}`
          );
        }

        const priceRuleData = await priceRuleResponse.json();
        const priceRuleId = priceRuleData.price_rule.id;

        // Create discount code linked to price rule
        const discountCodeResponse = await fetch(
          `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-10/price_rules/${priceRuleId}/discount_codes.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              discount_code: {
                code: code,
              },
            }),
          }
        );

        if (!discountCodeResponse.ok) {
          const errorData = await discountCodeResponse.json();
          throw new Error(
            `Discount code creation failed: ${JSON.stringify(errorData)}`
          );
        }

        createdCodes.push({ code, percentage });

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error creating discount code ${code}:`, error);
        failedCodes.push({ code, error: error.message });
      }
    }

    res.json({ createdCodes, failedCodes });
  } catch (error) {
    console.error('Error creating discount codes:', error);
    res.status(500).json({ error: error.message || 'Unknown error' });
  }
});

// --------------------------------------------------
// Create MailerLite campaign from AI recommendations (selected subset)
// --------------------------------------------------
app.post('/api/mailerlite/campaign', async (req, res) => {
  try {
    const { campaignName, pricingStrategy, selectedRecommendations } = req.body;

    if (!MAILERLITE_API_KEY) {
      return res
        .status(400)
        .json({ error: 'MailerLite API key not configured' });
    }

    if (
      !Array.isArray(selectedRecommendations) ||
      selectedRecommendations.length === 0
    ) {
      return res
        .status(400)
        .json({ error: 'No selected recommendations provided.' });
    }

    // Create a subscriber group for this campaign
    const groupResponse = await fetch(
      'https://connect.mailerlite.com/api/groups',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MAILERLITE_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name:
            campaignName ||
            `Dynamic Pricing - ${pricingStrategy} - ${new Date().toLocaleDateString()}`,
        }),
      }
    );

    const groupData = await groupResponse.json();
    const groupId = groupData.data?.id;

    if (!groupId) {
      throw new Error('Failed to create MailerLite group');
    }

    // Add subscribers to the group with custom fields
    let addedCount = 0;
    for (const rec of selectedRecommendations) {
      try {
        await fetch('https://connect.mailerlite.com/api/subscribers', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${MAILERLITE_API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email: rec.email,
            groups: [groupId],
            fields: {
              discount_code: rec.discountCode,
              discount_percent: String(rec.discountPercent ?? ''),
              messaging_angle: rec.messagingAngle || '',
              expected_value: String(rec.expectedValue ?? ''),
            },
          }),
        });
        addedCount++;
      } catch (error) {
        console.error(`Error adding subscriber ${rec.email}:`, error);
      }
    }

    // Create email campaign template
    const emailSubject = `${
      pricingStrategy === 'reactivation'
        ? 'We Miss You!'
        : 'Special Offer Just For You'
    } 🌾`;

    const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; }
    .discount-box { background: white; border: 3px dashed #667eea; padding: 20px; margin: 20px 0; text-align: center; border-radius: 10px; }
    .discount-code { font-size: 28px; font-weight: bold; color: #667eea; letter-spacing: 2px; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 10px 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌾 Daily N'Oats</h1>
      <p>Your Low-Carb Breakfast Revolution</p>
    </div>
    <div class="content">
      <p>Hi {$first_name},</p>
      <p>{$messaging_angle}</p>
      
      <div class="discount-box">
        <p style="margin: 0, font-size: 18px;">Your Exclusive Discount</p>
        <div class="discount-code">{$discount_code}</div>
        <p style="margin: 5px 0 0 0; color: #666;">Save {$discount_percent}% on your next order</p>
      </div>

      <p><strong>Why Daily N'Oats?</strong></p>
      <ul>
        <li>✅ Only 3g net carbs per serving</li>
        <li>✅ Perfect for keto & GLP-1 users</li>
        <li>✅ Delicious oatmeal taste without the carbs</li>
        <li>✅ Quick & easy breakfast solution</li>
      </ul>

      <center>
        <a href="https://dailynoats.com?discount={$discount_code}" class="cta-button">CLAIM YOUR DISCOUNT</a>
      </center>

      <p style="font-size: 12px; color: #666; margin-top: 30px;">This exclusive offer expires in 7 days. Use code {$discount_code} at checkout.</p>
    </div>
    <div class="footer">
      <p>&copy; 2024 Daily N'Oats. All rights reserved.</p>
      <p><a href="{$unsubscribe}" style="color: white;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
`;

    // Create the campaign
    const campaignResponse = await fetch(
      'https://connect.mailerlite.com/api/campaigns',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MAILERLITE_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name: campaignName || `Dynamic Pricing - ${pricingStrategy}`,
          type: 'regular',
          emails: [
            {
              subject: emailSubject,
              from_name: "Daily N'Oats",
              from: 'hello@dailynoats.com',
              content: emailHTML,
            },
          ],
          groups: [groupId],
        }),
      }
    );

    const campaignData = await campaignResponse.json();

    res.json({
      success: true,
      addedCount,
      groupId,
      campaignId: campaignData.data?.id || null,
    });
  } catch (error) {
    console.error('Error creating MailerLite campaign:', error);
    res.status(500).json({ error: error.message || 'Unknown error' });
  }
});
// --------------------------------------------------
// GLP-1 Breakfast Planner endpoint
// POST /api/glp1/plan
// --------------------------------------------------
app.post('/api/glp1/plan', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res
        .status(400)
        .json({ error: 'OpenAI API key (OPENAI_API_KEY) not configured' });
    }

    const { channel, profile, meta } = req.body || {};

    const medication = profile?.medication || 'GLP-1 medication';
    const primaryGoal = profile?.primaryGoal || 'Steady weight loss with muscle preservation';
    const morningTime = profile?.morningTime || 'about 10 minutes';
    const flavorPreference = profile?.flavorPreference || 'flexible';
    const morningFeeling = profile?.morningFeeling || 'varies';
    const dietaryConstraints = Array.isArray(profile?.dietaryConstraints)
      ? profile.dietaryConstraints.join(', ')
      : 'none specified';
    const freeTextNotes = profile?.freeTextNotes || '';
    const firstName = profile?.name || 'Friend';

    const brand = meta?.brand || "Daily N'Oats";

    const systemPrompt = `
You are a nutrition-focused AI creating GLP-1 friendly *educational breakfast ideas* centered around a low-carb oatmeal alternative brand called "${brand}".
You are NOT giving medical advice. You do NOT diagnose, treat, or prescribe. 
Always remind the user to check with their clinician for medical questions.
Your output must be HTML only (no markdown), suitable to drop directly into a Shopify page.
Use clear headings, bullet lists, and short paragraphs. Keep it under ~1,200 words.
Important constraints:
- Always mention that this is not medical advice.
- Emphasize protein, satiety, and gentle digestion for GLP-1 users.
- Build around ${brand} as the breakfast anchor.
`;

    const userPrompt = `
USER PROFILE:
- First name: ${firstName}
- GLP-1 medication: ${medication}
- Primary goal: ${primaryGoal}
- Morning time / complexity: ${morningTime}
- Flavor / texture preferences: ${flavorPreference}
- How mornings feel: ${morningFeeling}
- Dietary constraints: ${dietaryConstraints}
- Extra notes: ${freeTextNotes || 'none'}
- Channel: ${channel || 'shopify-glp1-planner'}

CONTEXT:
This plan will appear on a Shopify landing or product page for ${brand}, a low-carb, GLP-1 friendly oatmeal alternative. 
The user is likely trying to manage appetite, nausea, cravings, and blood sugar while on a GLP-1.

TASK:
Create a personalized *GLP-1 friendly breakfast plan* that:

1. Starts with a short, empathetic intro addressing GLP-1 users by name ("Hi ${firstName}, …").
2. Gives 2–3 specific breakfast "frameworks" built around ${brand}, including:
   - How to prepare it (simple steps)
   - Protein boosts (e.g., Greek yogurt, protein powder, nut butter, etc.)
   - Optional toppings or variations that match their flavor preferences.
3. Addresses their main goal (e.g., steady weight loss, nausea control, cravings, blood sugar).
4. Includes a small "If you feel more nauseous" or "If you have no appetite" variation.
5. Includes a simple, short "Shopping / Prep List" for the week.
6. Ends with a clear disclaimer that this is *general educational information only* and not medical advice.

OUTPUT FORMAT:
Return ONLY HTML. No markdown, no JSON.
Use this rough structure:

<h3>Hi [First Name], here’s your GLP-1 friendly breakfast plan</h3>
<p>Short intro...</p>

<h4>1. Core Daily N'Oats Breakfast</h4>
<p>...</p>
<ul>...</ul>

<h4>2. Alternate Option for Busy Mornings</h4>
<p>...</p>
<ul>...</ul>

<h4>3. Gentle Option for Nauseous Mornings</h4>
<p>...</p>
<ul>...</ul>

<h4>Weekly Shopping & Prep List</h4>
<ul>...</ul>

<p><em>Important: This is general educational information only and not medical advice. Always confirm with your clinician...</em></p>
`;

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content returned from OpenAI');
    }

    // Frontend expects { planHtml: "..." }
    res.json({ planHtml: content });
  } catch (error) {
    console.error('Error in /api/glp1/plan:', error);
    res.status(500).json({ error: error.message || 'Unknown error' });
  }
});
// --------------------------------------------------
// NEW: Apply AI-derived RULES to ALL Shopify customers in batch
// --------------------------------------------------
function applyRuleConfigToCustomer(customer, ruleConfig) {
  const tiers =
    ruleConfig && Array.isArray(ruleConfig.tiers) ? ruleConfig.tiers : [];
  const defaultTier = ruleConfig && ruleConfig.default ? ruleConfig.default : null;

  for (const tier of tiers) {
    const minTotalSpent =
      typeof tier.minTotalSpent === 'number' ? tier.minTotalSpent : 0;
    const maxTotalSpent =
      typeof tier.maxTotalSpent === 'number' ? tier.maxTotalSpent : Infinity;
    const minDays =
      typeof tier.minDaysSinceLastOrder === 'number'
        ? tier.minDaysSinceLastOrder
        : 0;
    const maxDays =
      typeof tier.maxDaysSinceLastOrder === 'number'
        ? tier.maxDaysSinceLastOrder
        : Infinity;

    const matchesTotal =
      customer.totalSpent >= minTotalSpent &&
      customer.totalSpent <= maxTotalSpent;
    const matchesDays =
      customer.daysSinceLastOrder >= minDays &&
      customer.daysSinceLastOrder <= maxDays;

    if (matchesTotal && matchesDays) {
      const discountPercent = tier.discountPercent || 0;
      const prefix = tier.discountCodePrefix || 'WINBACK';
      const code =
        tier.discountCode || `${prefix}${discountPercent}`.toUpperCase();

      return {
        customerId: customer.id,
        email: customer.email,
        discountPercent,
        discountCode: code,
        rationale:
          tier.rationale ||
          `Rule match: spent between ${minTotalSpent}–${maxTotalSpent}, inactive ${minDays}–${maxDays} days.`,
        messagingAngle:
          tier.messagingAngle ||
          'Personalized win-back offer based on your purchase history.',
        expectedValue:
          typeof tier.expectedValue === 'number' ? tier.expectedValue : undefined,
      };
    }
  }

  if (defaultTier) {
    const discountPercent = defaultTier.discountPercent || 0;
    const prefix = defaultTier.discountCodePrefix || 'WINBACK';
    const code =
      defaultTier.discountCode || `${prefix}${discountPercent}`.toUpperCase();

    return {
      customerId: customer.id,
      email: customer.email,
      discountPercent,
      discountCode: code,
      rationale: defaultTier.rationale || 'Default rule applied.',
      messagingAngle:
        defaultTier.messagingAngle ||
        'We appreciate you and wanted to send you a special offer.',
      expectedValue:
        typeof defaultTier.expectedValue === 'number'
          ? defaultTier.expectedValue
          : undefined,
    };
  }

  return null;
}

app.post('/api/reactivation/batch', async (req, res) => {
  try {
    const {
      pricingStrategy = 'reactivation',
      ruleConfig,
      campaignName,
      maxCustomers,
      sendToMailerLite = false,
    } = req.body || {};

    if (!ruleConfig) {
      return res
        .status(400)
        .json({ error: 'ruleConfig is required to run batch reactivation.' });
    }

    if (!SHOPIFY_API_KEY || !SHOPIFY_STORE) {
      return res
        .status(400)
        .json({ error: 'Shopify credentials not configured' });
    }

    const batchLimit = Math.min(
      Number(maxCustomers || 7000),
      Number(process.env.MAX_BATCH_CUSTOMERS || 10000)
    );

    console.log('\n========================================');
    console.log('🚀  /api/reactivation/batch HIT');
    console.log('========================================');
    console.log(`🔧 Shopify Store: ${SHOPIFY_STORE}`);
    console.log(`🔧 Batch limit: ${batchLimit}`);
    console.log('🔧 Using ruleConfig:');
    console.log(JSON.stringify(ruleConfig, null, 2));

    const rawCustomers = await fetchShopifyCustomersPaginated(batchLimit);

    console.log(`🛒 Customers fetched for batch: ${rawCustomers.length}`);

    const customersWithMetrics = rawCustomers.map((customer) => {
      const totalOrders = Number(customer.orders_count || 0);
      const totalSpent = parseFloat(customer.total_spent || '0.00');
      const lastOrderDateRaw = customer.updated_at || customer.created_at;
      const lastOrderDate = lastOrderDateRaw
        ? new Date(lastOrderDateRaw)
        : null;

      const daysSinceLastOrder = lastOrderDate
        ? Math.floor(
            (Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        : 999;

      return {
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name || 'Customer',
        lastName: customer.last_name || '',
        totalOrders,
        totalSpent,
        averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
        daysSinceLastOrder,
        lastOrderDate,
        tags: customer.tags || '',
        state: customer.state || 'active',
      };
    });

    const recommendations = [];
    for (const c of customersWithMetrics) {
      const rec = applyRuleConfigToCustomer(c, ruleConfig);
      if (rec && rec.discountPercent > 0 && rec.email) {
        recommendations.push(rec);
      }
    }

    console.log(`✅ Recommendations generated: ${recommendations.length}`);

    let mailerLiteResult = null;

    if (sendToMailerLite) {
      if (!MAILERLITE_API_KEY) {
        return res.status(400).json({
          error:
            'MAILERLITE_API_KEY not configured, cannot send directly to MailerLite.',
        });
      }

      console.log('📨 Sending batch to MailerLite…');

      const groupResponse = await fetch(
        'https://connect.mailerlite.com/api/groups',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${MAILERLITE_API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            name:
              campaignName ||
              `Dynamic Pricing Batch - ${pricingStrategy} - ${new Date().toLocaleDateString()}`,
          }),
        }
      );

      const groupData = await groupResponse.json();
      const groupId = groupData.data?.id;

      if (!groupId) {
        throw new Error(
          `Failed to create MailerLite group in batch endpoint: ${JSON.stringify(
            groupData
          )}`
        );
      }

      let addedCount = 0;
      for (const rec of recommendations) {
        try {
          await fetch('https://connect.mailerlite.com/api/subscribers', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${MAILERLITE_API_KEY}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              email: rec.email,
              groups: [groupId],
              fields: {
                discount_code: rec.discountCode,
                discount_percent: String(rec.discountPercent ?? ''),
                messaging_angle: rec.messagingAngle || '',
                expected_value: String(rec.expectedValue ?? ''),
              },
            }),
          });
          addedCount++;
        } catch (err) {
          console.error(`Error adding subscriber in batch: ${rec.email}`, err);
        }
      }

      mailerLiteResult = { groupId, addedCount };
      console.log(
        `📨 MailerLite batch complete. Group: ${groupId}, subscribers added: ${addedCount}`
      );
    }

    res.json({
      success: true,
      pricingStrategy,
      totalCustomersFetched: customersWithMetrics.length,
      totalRecommendations: recommendations.length,
      sampleRecommendations: recommendations.slice(0, 20),
      mailerLiteResult,
    });
  } catch (error) {
    console.error('Error in batch reactivation endpoint:', error);
    res.status(500).json({ error: error.message || 'Unknown error' });
  }
});

// --------------------------------------------------
// Start server
// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Dynamic Pricing AI Backend running on port ${PORT}`);
  console.log('🔧 Environment check:');
  console.log(`   - OpenAI configured: ${!!OPENAI_API_KEY}`);
  console.log(
    `   - Shopify configured: ${!!SHOPIFY_API_KEY} (store: ${SHOPIFY_STORE})`
  );
  console.log(`   - MailerLite configured: ${!!MAILERLITE_API_KEY}`);
  console.log(`   - Max customers analyzed: ${MAX_CUSTOMERS_ANALYZED}`);
  console.log(`   - Max customers for AI analysis: ${MAX_CUSTOMERS_FOR_AI}`);
});

module.exports = app;