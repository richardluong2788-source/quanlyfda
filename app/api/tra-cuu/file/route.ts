import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { query, queryOne } from '@/lib/db'

interface ServiceRow {
  id: string
  fda_code: string | null
  client_email: string | null
}

interface DocumentRow {
  id: string
  service_id: string
}

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
    const services = await query<ServiceRow>(
      `SELECT 
        s.id,
        s.fda_code,
        p.email as client_email
      FROM services s
      LEFT JOIN profiles p ON s.client_id = p.id
      WHERE LOWER(s.fda_code) = LOWER($1)
      LIMIT 5`,
      [code]
    )

    const matchedService = services?.find(
      (s) => s.client_email?.toLowerCase() === email
    )

    if (!matchedService) {
      return NextResponse.json(
        { error: 'Không có quyền tải file này' },
        { status: 403 }
      )
    }

    // Verify the document belongs to this service
    const document = await queryOne<DocumentRow>(
      `SELECT id, service_id FROM documents WHERE file_url = $1`,
      [pathname]
    )

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
