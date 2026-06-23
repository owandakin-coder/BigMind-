// useCourseAssets.ts — normalized read of the generated, course-level assets
// (sales page + marketing) for the preview screens. Reads existing
// digital_assets only; picks the LATEST asset of each kind by created_at
// (the is_active flag is unreliable across repeated runs).
'use client'
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'

export interface SalesPageData {
  headline?: string
  subheadline?: string
  hero_section?: { hook_statement?: string; problem_agitation?: string; solution_promise?: string }
  benefits?: { title?: string; description?: string; icon_suggestion?: string }[]
  social_proof?: { testimonial_prompts?: string[]; stat_claims?: string[]; trust_badges?: string[] }
  objection_handling?: { objection?: string; response?: string }[]
  pricing_section?: { price_usd?: number; original_price?: number; payment_plans?: { label?: string; amount_usd?: number; installments?: number }[]; guarantee?: string; scarcity_element?: string }
  cta_buttons?: { text?: string; subtext?: string; position?: string }[]
  faq?: { question?: string; answer?: string }[]
  seo_title?: string
  seo_description?: string
}

export interface MarketingData {
  twitterThreads: { hook?: string; tweets?: string[]; cta?: string }[]
  linkedinCarousel: { title?: string; slides?: { slide_number?: number; headline?: string; body?: string }[]; cover_image_prompt?: string } | null
  videoScripts: { platform?: string; hook?: string; body?: string; cta?: string; duration_s?: number }[]
  newsletter: { subject_line?: string; preview_text?: string; body?: string } | null
  emailSequence: { day?: number; subject?: string; preview?: string; body?: string; cta?: string }[]
  adCopy: { platform?: string; headline?: string; description?: string; cta_button?: string }[]
  contentCalendar: { day?: number; platform?: string; content_type?: string; topic?: string }[]
}

export interface CourseAssets {
  salesPage: SalesPageData | null
  marketing: MarketingData
  hasMarketing: boolean
}

export function useCourseAssets(courseId: string) {
  const supabase = createBrowserClient()

  return useQuery<CourseAssets>({
    queryKey: ['course-assets', courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from('digital_assets')
        .select('content_json, created_at')
        .eq('source_id', courseId)
        .order('created_at', { ascending: false })

      const rows = (data ?? []) as { content_json: Record<string, unknown> }[]

      // Sales page = latest asset shaped like a sales page (headline + hero_section)
      const salesPage = (rows.find(r => r.content_json?.headline && r.content_json?.hero_section)
        ?.content_json ?? null) as SalesPageData | null

      // Marketing assets are wrapped as { type, data } — take the latest per type
      const latestByType: Record<string, unknown> = {}
      for (const r of rows) {
        const t = r.content_json?.type as string | undefined
        if (t && !(t in latestByType)) latestByType[t] = r.content_json?.data
      }

      const marketing: MarketingData = {
        twitterThreads:  (latestByType['twitter_threads'] as MarketingData['twitterThreads']) ?? [],
        linkedinCarousel:(latestByType['linkedin_carousel'] as MarketingData['linkedinCarousel']) ?? null,
        videoScripts:    (latestByType['video_scripts'] as MarketingData['videoScripts']) ?? [],
        newsletter:      (latestByType['newsletter'] as MarketingData['newsletter']) ?? null,
        emailSequence:   (latestByType['email_sequence'] as MarketingData['emailSequence']) ?? [],
        adCopy:          (latestByType['ad_copy'] as MarketingData['adCopy']) ?? [],
        contentCalendar: (latestByType['content_calendar'] as MarketingData['contentCalendar']) ?? [],
      }

      const hasMarketing =
        marketing.twitterThreads.length > 0 || !!marketing.linkedinCarousel ||
        marketing.videoScripts.length > 0 || !!marketing.newsletter ||
        marketing.emailSequence.length > 0 || marketing.adCopy.length > 0 ||
        marketing.contentCalendar.length > 0

      return { salesPage, marketing, hasMarketing }
    },
  })
}
