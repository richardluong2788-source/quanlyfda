import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')?.trim()
    const email = searchParams.get('email')?.trim()?.toLowerCase()

    if (!code || !email) {
      return NextResponse.json(
        { error: 'Vui lòng nhập mã số FDA và email' },
        { status: 400 }
      )
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient()

    // Search by FDA code and client email
    const { data: services, error } = await supabase
      .from('services')
      .select(`
        id,
        service_type,
        product_name,
        product_description,
        current_stage,
        fda_code,
        fda_issue_date,
        fda_expiry_date,
        fda_duns_code,
        fda_fei_code,
        us_agent_name,
        us_agent_start_date,
        us_agent_expiry_date,
        created_at,
        updated_at,
        client:profiles!services_client_id_fkey(email, full_name, company_name)
      `)
      .ilike('fda_code', code)
      .limit(5)

    if (error) {
      console.error('[v0] Error searching services:', error)
      return NextResponse.json(
        { error: 'Đã có lỗi xảy ra khi tìm kiếm' },
        { status: 500 }
      )
    }

    // Filter by email to verify ownership
    const matchedService = services?.find(
      (s) => s.client?.email?.toLowerCase() === email
    )

    if (!matchedService) {
      return NextResponse.json(
        { error: 'Không tìm thấy hồ sơ với mã số và email này' },
        { status: 404 }
      )
    }

    // Get documents for this service (only result type documents)
    const { data: documents } = await supabase
      .from('documents')
      .select(`
        id,
        document_type,
        category,
        file_name,
        file_url,
        file_size,
        mime_type,
        stage,
        created_at
      `)
      .eq('service_id', matchedService.id)
      .eq('document_type', 'result')
      .order('created_at', { ascending: false })

    // Get activity logs (recent updates)
    const { data: activities } = await supabase
      .from('activity_logs')
      .select(`
        id,
        action,
        details,
        created_at
      `)
      .eq('service_id', matchedService.id)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      service: {
        id: matchedService.id,
        service_type: matchedService.service_type,
        product_name: matchedService.product_name,
        product_description: matchedService.product_description,
        current_stage: matchedService.current_stage,
        fda_code: matchedService.fda_code,
        fda_issue_date: matchedService.fda_issue_date,
        fda_expiry_date: matchedService.fda_expiry_date,
        fda_duns_code: matchedService.fda_duns_code,
        fda_fei_code: matchedService.fda_fei_code,
        us_agent_name: matchedService.us_agent_name,
        us_agent_start_date: matchedService.us_agent_start_date,
        us_agent_expiry_date: matchedService.us_agent_expiry_date,
        client_name: matchedService.client?.full_name || matchedService.client?.company_name,
        created_at: matchedService.created_at,
        updated_at: matchedService.updated_at,
      },
      documents: documents || [],
      activities: activities || [],
    })
  } catch (error) {
    console.error('[v0] Error in tracking API:', error)
    return NextResponse.json(
      { error: 'Đã có lỗi xảy ra' },
      { status: 500 }
    )
  }
}
