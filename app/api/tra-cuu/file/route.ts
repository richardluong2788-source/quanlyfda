import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'

export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname')
    const code = request.nextUrl.searchParams.get('code')?.trim()
    const email = request.nextUrl.searchParams.get('email')?.trim()?.toLowerCase()

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    if (!code || !email) {
      return NextResponse.json(
        { error: 'Vui lòng cung cấp mã số FDA và email để tải file' },
        { status: 401 }
      )
    }

    // Verify ownership by checking if the service exists with this code and email
    const { createAdminClient } = await import('@/lib/supabase/server')
    const supabase = createAdminClient()

    const { data: services } = await supabase
      .from('services')
      .select(`
        id,
        fda_code,
        client:profiles!services_client_id_fkey(email)
      `)
      .ilike('fda_code', code)
      .limit(5)

    const matchedService = services?.find(
      (s) => s.client?.email?.toLowerCase() === email
    )

    if (!matchedService) {
      return NextResponse.json(
        { error: 'Không có quyền tải file này' },
        { status: 403 }
      )
    }

    // Verify the document belongs to this service
    const { data: document } = await supabase
      .from('documents')
      .select('id, service_id')
      .eq('file_url', pathname)
      .single()

    if (!document || document.service_id !== matchedService.id) {
      return NextResponse.json(
        { error: 'Không có quyền tải file này' },
        { status: 403 }
      )
    }

    const result = await get(pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })

    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }

    // Blob hasn't changed
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    const filename = pathname.split('/').pop() || 'download'

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[v0] Error serving public file:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
