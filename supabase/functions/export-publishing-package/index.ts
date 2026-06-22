// export-publishing-package/index.ts
// Generates platform-specific publishing packages for 6 course marketplaces
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Platform Specs ────────────────────────────────────────────────────────────
const PLATFORM_SPECS = {
  udemy: {
    name: 'Udemy',
    maxTitleLen: 60,
    maxDescLen: 500,
    subtitleMaxLen: 120,
    supportsModules: true,
    requiresVideoMin: 30,
    priceModel: 'marketplace',
    revenueSharePct: 37,
    formatNotes: 'Udemy controls final pricing. Focus on value and completeness.',
    checklist: [
      'Title under 60 chars — no "complete", "best", "ultimate" claims',
      'Subtitle under 120 chars with primary keyword',
      'At least 30 minutes of video content',
      'Minimum 5 lectures',
      'Course image 750x422px JPG/PNG',
      'Promotional video 2–5 minutes',
      'Instructor bio completed',
      'Learning objectives (4–8 bullet points)',
      'Target audience defined (3+ lines)',
      'Course requirements listed',
    ],
  },
  gumroad: {
    name: 'Gumroad',
    maxTitleLen: 100,
    maxDescLen: 10000,
    supportsModules: false,
    requiresVideoMin: 0,
    priceModel: 'fixed_or_pwyw',
    revenueSharePct: 90,
    formatNotes: 'Long-form sales page. Story-driven copy converts best.',
    checklist: [
      'Compelling headline with clear outcome',
      'Sales page with problem → solution arc',
      'Social proof / testimonials section',
      'Clear pricing (fixed or pay-what-you-want)',
      'File delivery configured',
      'Cover image 1280x720px',
      'Preview/sample content attached',
      'Thank-you page customized',
    ],
  },
  teachable: {
    name: 'Teachable',
    maxTitleLen: 80,
    maxDescLen: 2000,
    supportsModules: true,
    requiresVideoMin: 0,
    priceModel: 'fixed',
    revenueSharePct: 95,
    formatNotes: 'Structured curriculum with sections and lectures.',
    checklist: [
      'School subdomain configured',
      'Course thumbnail 750x422px',
      'Author bio with photo',
      'Curriculum fully uploaded (sections + lectures)',
      'Pricing and payment plans set',
      'Sales page completed',
      'Completion certificate enabled',
      'Drip content schedule (optional)',
      'Coupon codes created for launch',
    ],
  },
  thinkific: {
    name: 'Thinkific',
    maxTitleLen: 100,
    maxDescLen: 3000,
    supportsModules: true,
    requiresVideoMin: 0,
    priceModel: 'fixed_or_subscription',
    revenueSharePct: 100,
    formatNotes: 'Zero transaction fees on paid plans. Strong community features.',
    checklist: [
      'Course card image 1200x600px',
      'Welcome video recorded',
      'Course sections and lessons structured',
      'Pricing tiers configured',
      'Student experience settings reviewed',
      'Custom domain connected (if applicable)',
      'Email notifications customized',
      'Completion certificates designed',
    ],
  },
  kajabi: {
    name: 'Kajabi',
    maxTitleLen: 100,
    maxDescLen: 5000,
    supportsModules: true,
    requiresVideoMin: 0,
    priceModel: 'fixed_or_subscription_or_payment_plan',
    revenueSharePct: 100,
    formatNotes: 'All-in-one. Pipelines + email + community included.',
    checklist: [
      'Pipeline (funnel) created for launch',
      'Email sequences set up (welcome, nurture, sales)',
      'Product thumbnail 1920x1080px',
      'Offer created with pricing',
      'Landing page built in Kajabi',
      'Assessment/quiz added (optional)',
      'Community space configured (optional)',
      'Affiliate program enabled (optional)',
    ],
  },
  podia: {
    name: 'Podia',
    maxTitleLen: 100,
    maxDescLen: 4000,
    supportsModules: true,
    requiresVideoMin: 0,
    priceModel: 'fixed_or_subscription',
    revenueSharePct: 100,
    formatNotes: 'Simple storefront. Excellent for digital downloads + courses.',
    checklist: [
      'Storefront customized with brand colors',
      'Course cover image 1280x720px',
      'Curriculum sections added',
      'Pricing set (one-time or membership)',
      'Upsell configured on checkout',
      'Email list import (if migrating)',
      'Testimonials added to sales page',
      'Free preview lessons unlocked',
    ],
  },
} as const

type Platform = keyof typeof PLATFORM_SPECS
type OutputFormat = 'json' | 'markdown' | 'zip-manifest'

// ─── Package Builder ───────────────────────────────────────────────────────────
async function buildPackage(
  serviceClient: ReturnType<typeof createClient>,
  courseId: string,
  platform: Platform,
) {
  const spec = PLATFORM_SPECS[platform]

  // 7 parallel DB queries
  const [
    { data: course },
    { data: blueprint },
    { data: salesPage },
    { data: seoMeta },
    { data: marketingAssets },
    { data: agentLogs },
    { data: seoReport },
  ] = await Promise.all([
    serviceClient.from('courses').select('*').eq('id', courseId).single(),
    serviceClient.from('course_blueprints').select('*').eq('course_id', courseId).single(),
    serviceClient.from('digital_assets').select('*').eq('course_id', courseId).eq('asset_type', 'sales_page').order('created_at', { ascending: false }).limit(1).single(),
    serviceClient.from('seo_metadata').select('*').eq('course_id', courseId).single(),
    serviceClient.from('digital_assets').select('*').eq('course_id', courseId).in('asset_type', ['video_script', 'workbook', 'thumbnail', 'email_sequence']).order('created_at', { ascending: false }),
    serviceClient.from('agent_logs').select('agent_name, output_data, created_at').eq('course_id', courseId).eq('status', 'completed').order('created_at', { ascending: false }),
    serviceClient.from('digital_assets').select('*').eq('course_id', courseId).eq('asset_type', 'seo_report').order('created_at', { ascending: false }).limit(1).single(),
  ])

  if (!course) throw new Error('Course not found')

  // Parse blueprint modules
  const modules: Array<{ title: string; lessons: string[] }> = []
  if (blueprint?.outline) {
    const outline = typeof blueprint.outline === 'string'
      ? JSON.parse(blueprint.outline)
      : blueprint.outline
    if (Array.isArray(outline?.modules)) {
      for (const mod of outline.modules) {
        modules.push({
          title: mod.title ?? mod.name ?? 'Module',
          lessons: Array.isArray(mod.lessons)
            ? mod.lessons.map((l: { title?: string; name?: string } | string) =>
                typeof l === 'string' ? l : (l.title ?? l.name ?? 'Lesson'))
            : [],
        })
      }
    }
  }

  // Truncate fields to platform limits
  const title = (course.title ?? '').slice(0, spec.maxTitleLen)
  const description = (course.description ?? course.niche ?? '').slice(0, spec.maxDescLen)

  // Collect asset content by type
  const assetsByType: Record<string, string> = {}
  for (const asset of marketingAssets ?? []) {
    const content = typeof asset.content === 'string' ? asset.content : JSON.stringify(asset.content)
    assetsByType[asset.asset_type] = content
  }

  // Sales copy from sales_page asset
  const salesCopy = salesPage?.content
    ? (typeof salesPage.content === 'string' ? salesPage.content : JSON.stringify(salesPage.content))
    : ''

  // SEO data
  const seo = {
    metaTitle: seoMeta?.meta_title ?? title,
    metaDescription: seoMeta?.meta_description ?? description.slice(0, 160),
    keywords: seoMeta?.keywords ?? [],
    slug: seoMeta?.slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  }

  // Pricing recommendation
  const pricingRec = (() => {
    const p = platform
    if (p === 'gumroad') return { suggested: course.price ?? 97, pwyw: true, min: 27 }
    if (p === 'udemy') return { suggested: 89.99, note: 'Udemy controls final price; set max to $189.99' }
    return { suggested: course.price ?? 97, note: 'You control pricing directly' }
  })()

  // Validation
  const validationIssues: string[] = []
  if (title.length === 0) validationIssues.push('Title is empty')
  if (modules.length === 0) validationIssues.push('No curriculum modules found — run Course Architect agent first')
  if (!salesCopy) validationIssues.push('No sales copy — run Sales agent first')
  if (platform === 'udemy' && modules.reduce((acc, m) => acc + m.lessons.length, 0) < 5)
    validationIssues.push('Udemy requires at least 5 lectures')

  return {
    meta: {
      courseId,
      platform,
      platformName: spec.name,
      generatedAt: new Date().toISOString(),
      validationIssues,
      isReadyToPublish: validationIssues.length === 0,
    },
    course: {
      title,
      description,
      niche: course.niche ?? '',
      price: course.price,
      status: course.status,
    },
    curriculum: {
      totalModules: modules.length,
      totalLessons: modules.reduce((acc, m) => acc + m.lessons.length, 0),
      modules,
    },
    assets: {
      salesCopy,
      videoScript: assetsByType['video_script'] ?? '',
      workbook: assetsByType['workbook'] ?? '',
      emailSequence: assetsByType['email_sequence'] ?? '',
      thumbnail: assetsByType['thumbnail'] ?? '',
    },
    seo,
    pricing: pricingRec,
    platformSpec: {
      name: spec.name,
      revenueShare: spec.revenueSharePct,
      priceModel: spec.priceModel,
      notes: spec.formatNotes,
      checklist: spec.checklist,
    },
    seoReport: seoReport?.content ?? null,
    agentExecutionSummary: (agentLogs ?? []).map((l) => ({
      agent: l.agent_name,
      completedAt: l.created_at,
    })),
  }
}

// ─── Markdown Formatter ────────────────────────────────────────────────────────
function toMarkdown(pkg: ReturnType<typeof buildPackage> extends Promise<infer T> ? T : never): string {
  const { meta, course, curriculum, assets, seo, pricing, platformSpec } = pkg

  const sections: string[] = []

  sections.push(`# ${course.title}`)
  sections.push(`**Platform:** ${platformSpec.name} | **Generated:** ${meta.generatedAt}`)
  sections.push('')

  if (meta.validationIssues.length > 0) {
    sections.push('## ⚠️ Validation Issues')
    sections.push(meta.validationIssues.map((i) => `- ❌ ${i}`).join('\n'))
    sections.push('')
  }

  sections.push('## Course Description')
  sections.push(course.description)
  sections.push('')

  sections.push('## Curriculum')
  sections.push(`${curriculum.totalModules} modules · ${curriculum.totalLessons} lessons`)
  sections.push('')
  for (const mod of curriculum.modules) {
    sections.push(`### ${mod.title}`)
    for (const lesson of mod.lessons) sections.push(`- ${lesson}`)
    sections.push('')
  }

  if (assets.salesCopy) {
    sections.push('## Sales Copy')
    sections.push(assets.salesCopy.slice(0, 2000))
    sections.push('')
  }

  sections.push('## SEO')
  sections.push(`**Meta Title:** ${seo.metaTitle}`)
  sections.push(`**Meta Description:** ${seo.metaDescription}`)
  sections.push(`**Slug:** ${seo.slug}`)
  if (Array.isArray(seo.keywords) && seo.keywords.length > 0) {
    sections.push(`**Keywords:** ${(seo.keywords as string[]).join(', ')}`)
  }
  sections.push('')

  sections.push('## Pricing')
  sections.push(`**Suggested Price:** $${pricing.suggested}`)
  if ('note' in pricing) sections.push(`*${pricing.note}*`)
  sections.push('')

  sections.push('## Platform Checklist')
  for (const item of platformSpec.checklist) sections.push(`- [ ] ${item}`)
  sections.push('')

  sections.push('---')
  sections.push(`*Ready to publish: ${meta.isReadyToPublish ? '✅ Yes' : '❌ No'}*`)

  return sections.join('\n')
}

// ─── ZIP Manifest ──────────────────────────────────────────────────────────────
function toZipManifest(pkg: Awaited<ReturnType<typeof buildPackage>>, platform: Platform) {
  const slug = pkg.seo.slug || 'course'
  return {
    rootDir: `${slug}-${platform}-package/`,
    files: [
      { path: 'package.json', description: 'Full course data as JSON', sizeEstimate: '~50KB' },
      { path: 'README.md', description: 'Platform-specific upload guide' },
      { path: 'sales-copy.md', description: 'Sales page copy ready to paste' },
      { path: 'curriculum.md', description: 'Full curriculum structure' },
      { path: 'seo.json', description: 'SEO metadata' },
      { path: 'workbook.md', description: 'Student workbook content' },
      { path: 'email-sequence.md', description: 'Launch email sequence' },
      { path: 'checklist.md', description: `${PLATFORM_SPECS[platform].name} upload checklist` },
      { path: 'assets/', description: 'Thumbnail and media references' },
      { path: 'scripts/', description: 'Video scripts per module' },
    ],
    instructions: [
      '1. Download this ZIP and extract it',
      `2. Open ${PLATFORM_SPECS[platform].name} and create a new course`,
      '3. Follow the checklist.md step by step',
      '4. Copy content from each file into the corresponding platform field',
      '5. Upload assets from the assets/ folder',
      '6. Preview before publishing',
    ],
  }
}

// ─── Serve ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    // JWT validation
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: jwtUser }, error: jwtErr } = await anonClient.auth.getUser()
    if (jwtErr || !jwtUser) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Parse + validate request body
    const body = await req.json()
    const courseId: string = body.courseId
    const platform: Platform = body.platform
    const format: OutputFormat = body.format ?? 'json'

    const validPlatforms = Object.keys(PLATFORM_SPECS) as Platform[]
    if (!courseId) {
      return new Response(JSON.stringify({ error: 'courseId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!validPlatforms.includes(platform)) {
      return new Response(JSON.stringify({ error: `platform must be one of: ${validPlatforms.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Ownership check
    const { data: course } = await serviceClient
      .from('courses')
      .select('user_id, status')
      .eq('id', courseId)
      .single()

    if (!course) {
      return new Response(JSON.stringify({ error: 'Course not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (course.user_id !== jwtUser.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build package
    const pkg = await buildPackage(serviceClient, courseId, platform)

    // Format response
    if (format === 'markdown') {
      const md = toMarkdown(pkg)
      return new Response(md, {
        headers: { ...corsHeaders, 'Content-Type': 'text/markdown; charset=utf-8' },
      })
    }

    if (format === 'zip-manifest') {
      const manifest = toZipManifest(pkg, platform)
      return new Response(JSON.stringify({ package: pkg, zipManifest: manifest }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Default: JSON
    return new Response(JSON.stringify(pkg), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[export-publishing-package]', err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
