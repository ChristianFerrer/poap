import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Token endpoint for direct browser -> Vercel Blob uploads (see
 * ImportPanel.tsx). Only used for files too large to POST straight to
 * /api/import-excel — Vercel serverless functions cap request bodies at
 * 4.5 MB regardless of anything this app configures, and the reference
 * workbook this feature was built against is already ~5.5 MB.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [XLSX_CONTENT_TYPE],
        addRandomSuffix: true,
        maximumSizeInBytes: 50 * 1024 * 1024,
      }),
      // No onUploadCompleted work needed: /api/import-excel fetches the
      // blob once (to load it with exceljs) and deletes it right after,
      // so there's nothing left to clean up here. It also isn't reliably
      // reachable in local dev anyway, since Vercel can't call back into
      // localhost.
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error al preparar la subida." }, { status: 400 });
  }
}
