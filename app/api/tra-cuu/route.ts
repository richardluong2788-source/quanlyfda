import { type NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

interface ServiceRow {
  id: string
  service_type: string
  product_name: string | null
  product_description: string | null
  current_stage: string
  fda_code: string | null
  fda_issue_date: string | null
  fda_expiry_date: string | null
  fda_duns_code: string | null
  fda_fei_code: string | null
  us_agent_name: string | null
  us_agent_start_date: string | null
  us_agent_expiry_date: string | null
  created_at: string
  updated_at: string
  client_email: string | null
  client_name: string | null
  company_name: string | null
}

interface DocumentRow {
  id: string
  document_type: string
  category: string | null
  file_name: string
  file_url: string
  file_size: number | null
  mime_type: string | null
  stage: string | null
  created_at: string
}

interface ActivityRow {
  id: string
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

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

    // Search by FDA code and client email using direct Postgres query
    const services = await query<ServiceRow>(
      `SELECT 
        s.id,
        s.service_type,
        s.product_name,
        s.product_description,
        s.current_stage,
        s.fda_code,
        s.fda_issue_date,
        s.fda_expiry_date,
        s.fda_duns_code,
        s.fda_fei_code,
        s.us_agent_name,
        s.us_agent_start_date,
        s.us_agent_expiry_date,
        s.created_at,
        s.updated_at,
        p.email as client_email,
        p.full_name as client_name,
        p.company_name
      FROM services s
      LEFT JOIN profiles p ON s.client_id = p.id
      WHERE LOWER(s.fda_code) = LOWER($1)
      LIMIT 5`,
      [code]
    )

    // Filter by email to verify ownership
    const matchedService = services?.find(
      (s) => s.client_email?.toLowerCase() === email
    )

    if (!matchedService) {
      return NextResponse.json(
        { error: 'Không tìm thấy hồ sơ với mã số và email này' },
        { status: 404 }
      )
    }

    // Get documents for this service (only result type documents)
    const documents = await query<DocumentRow>(
      `SELECT 
        id,
        document_type,
        category,
        file_name,
        file_url,
        file_size,
        mime_type,
        stage,
        created_at
      FROM documents
      WHERE service_id = $1 AND document_type = 'result'
      ORDER BY created_at DESC`,
      [matchedService.id]
    )

    // Get activity logs (recent updates)
    const activities = await query<ActivityRow>(
      `SELECT 
        id,
        action,
        details,
        created_at
      FROM activity_logs
      WHERE service_id = $1
      ORDER BY created_at DESC
      LIMIT 10`,
      [matchedService.id]
    )

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
        client_name: matchedService.client_name || matchedService.company_name,
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
