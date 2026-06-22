/**
 * CourseForge AI — Root redirect
 * In a real deploy this would be the dashboard listing all user courses.
 * For now, redirects to /dashboard.
 */
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/dashboard')
}
