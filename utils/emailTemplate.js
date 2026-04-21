export const weeklyEmailTemplate = (contents) => {

    // ─── helpers ───────────────────────────────────────────────────────────
    const fmt = (dateStr) =>
        new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const BG_IMAGE_URL = "https://res.cloudinary.com/ddior7stk/image/upload/v1776472734/background_ras8qi.jpg";
    
    const LOGO_URL = "https://res.cloudinary.com/dlvsqylnq/image/upload/f_auto,q_auto/logo_dtqabu";

    // ─── article cards ─────────────────────────────────────────────────────
    const articleCards = contents.map((c, index) => `

        <tr>
            <td style="padding:0 0 24px 0;">
                <table width="100%" cellpadding="0" cellspacing="0" style="
                    background:#ffffff;
                    border-radius:12px;
                    border:1px solid #e2e8f0;
                    overflow:hidden;
                    box-shadow:0 1px 3px rgba(15,23,42,0.03);
                ">
                    <tr>
                        <td style="padding:24px;">

                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                                <tr>
                                    <td>
                                        <span style="
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:12px;
                                            color:#64748b;
                                            font-weight:500;
                                        ">
                                            <strong style="color:#0f172a; font-weight:700;">#${String(index + 1).padStart(2,'0')}</strong> 
                                            &nbsp;&bull;&nbsp; ${fmt(c.createdAt)}
                                        </span>
                                    </td>
                                </tr>
                            </table>

                            <h2 style="
                                margin:0 0 6px 0;
                                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                font-size:18px;
                                font-weight:700;
                                color:#0f172a;
                                line-height:1.4;
                            ">${c.title}</h2>

                            ${c.url ? `
                            <a href="${c.url}" style="
                                display:inline-block;
                                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                font-size:13px;
                                color:#3b5bfb;
                                text-decoration:none;
                                margin-bottom:20px;
                            ">Read original article &rarr;</a>
                            ` : '<div style="margin-bottom:20px;"></div>'}

                            ${c.summary ? `
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                                <tr>
                                    <td style="
                                        background:#f8fafc;
                                        border-left:3px solid #94a3b8;
                                        border-radius:4px 8px 8px 4px;
                                        padding:16px;
                                    ">
                                        <span style="
                                            display:block;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:11px;
                                            font-weight:700;
                                            letter-spacing:0.06em;
                                            text-transform:uppercase;
                                            color:#475569;
                                            margin-bottom:8px;
                                        ">Overview</span>
                                        <p style="
                                            margin:0;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:14.5px;
                                            color:#334155;
                                            line-height:1.6;
                                        ">${c.summary}</p>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}

                            ${c.tags && c.tags.length > 0 ? `
                            <div style="margin-bottom:20px; line-height:2.2;">
                                ${c.tags.map(tag => `<span style="
                                    display:inline-block;
                                    background:#f1f5f9;
                                    color:#64748b;
                                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                    font-size:11px;
                                    font-weight:600;
                                    padding:4px 12px;
                                    border-radius:6px;
                                    margin:0 6px 0 0;
                                ">${tag}</span>`).join('')}
                            </div>
                            ` : ''}

                            ${c.quiz ? `
                            <table width="100%" cellpadding="0" cellspacing="0" style="
                                border:1px solid #e2e8f0;
                                border-radius:8px;
                                background:#ffffff;
                            ">
                                <tr>
                                    <td style="padding:16px;">
                                        <span style="
                                            display:block;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:11px;
                                            font-weight:700;
                                            letter-spacing:0.06em;
                                            text-transform:uppercase;
                                            color:#475569;
                                            margin-bottom:12px;
                                        ">Quick Check</span>
                                        
                                        <p style="
                                            margin:0 0 14px 0;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:14px;
                                            font-weight:600;
                                            color:#0f172a;
                                            line-height:1.5;
                                        ">${c.quiz.question}</p>

                                        <table cellpadding="0" cellspacing="0">
                                            ${c.quiz.options.map((opt) => {
                                                const isCorrect = opt === c.quiz.correctAnswer;
                                                return `<tr>
                                                    <td style="padding:4px 0;">
                                                        <span style="
                                                            display:block;
                                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                                            font-size:13.5px;
                                                            color:${isCorrect ? '#15803d' : '#64748b'};
                                                            font-weight:${isCorrect ? '600' : '400'};
                                                        ">${isCorrect ? '✓' : '○'}&nbsp;&nbsp;${opt}</span>
                                                    </td>
                                                </tr>`;
                                            }).join('')}
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}

                        </td>
                    </tr>
                </table>
            </td>
        </tr>

    `).join('');

    // ─── full template ──────────────────────────────────────────────────────
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Weekly Digest — TickTick Extension</title>
</head>
<body style="margin:0; padding:0; background:#f1f4f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f9; padding:36px 16px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

                    <tr>
                        <td style="
                            border-radius:16px 16px 0 0;
                            border:1.5px solid #e2e8f0;
                            border-bottom:none;
                            overflow:hidden;
                            background-color:#f8f9fc;
                            background-image:linear-gradient(rgba(248,249,252,0.80), rgba(248,249,252,0.96)), url('${BG_IMAGE_URL}');
                            background-size:cover;
                            background-position:right center;
                            padding:32px 32px 0;
                        ">

                            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                <tr>
                                    <td style="vertical-align:middle; padding-right:12px;">
                                        <img src="${LOGO_URL}" width="34" height="34" alt="Logo" style="
                                            display:block;
                                            width:34px;
                                            height:34px;
                                            border-radius:10px;
                                            object-fit:cover;
                                            border:1px solid rgba(0,0,0,0.05);
                                        " />
                                    </td>
                                    <td style="vertical-align:middle;">
                                        <p style="
                                            margin:0 0 2px 0;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:10px;
                                            font-weight:700;
                                            letter-spacing:0.08em;
                                            text-transform:uppercase;
                                            color:#64748b;
                                        ">Knowledge Workspace</p>
                                        <p style="
                                            margin:0;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:15px;
                                            font-weight:700;
                                            color:#0f172a;
                                            letter-spacing:-0.01em;
                                        ">TickTick Extension</p>
                                    </td>
                                </tr>
                            </table>

                            <h1 style="
                                margin:0 0 10px 0;
                                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                font-size:28px;
                                font-weight:700;
                                color:#0f172a;
                                letter-spacing:-0.03em;
                                line-height:1.2;
                            ">
                                Your Weekly Digest
                            </h1>
                            <p style="
                                margin:0 0 24px 0;
                                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                font-size:14px;
                                color:#475569;
                                line-height:1.6;
                            ">Here is a quick recap of the <strong style="color:#0f172a;">${contents.length} article${contents.length !== 1 ? 's' : ''}</strong> you saved this week to keep you up to speed.</p>

                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
                                <tr>
                                    <td style="border-bottom:1.5px solid #e2e8f0; padding-bottom:0;">
                                        <span style="
                                            display:inline-block;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:13px;
                                            font-weight:600;
                                            color:#0f172a;
                                            padding:8px 0;
                                            border-bottom:2.5px solid #0f172a;
                                            margin-bottom:-1.5px;
                                        ">Weekly Review</span>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <tr>
                        <td style="
                            background:#f8f9fc;
                            border-left:1.5px solid #e2e8f0;
                            border-right:1.5px solid #e2e8f0;
                            padding:24px 20px 0 20px;
                        ">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                ${articleCards}
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="
                            background:#ffffff;
                            border-radius:0 0 16px 16px;
                            border:1.5px solid #e2e8f0;
                            border-top:1.5px solid #e2e8f0;
                            padding:20px 32px;
                        ">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <p style="
                                            margin:0 0 4px 0;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:13px;
                                            font-weight:600;
                                            color:#334155;
                                        ">TickTick Extension</p>
                                        <p style="
                                            margin:0;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:12px;
                                            color:#94a3b8;
                                        ">Capture &rarr; Enrich &rarr; Review</p>
                                    </td>
                                    <td align="right" style="vertical-align:middle;">
                                        <img src="${LOGO_URL}" width="32" height="32" alt="Logo" style="
                                            display:inline-block;
                                            width:32px;
                                            height:32px;
                                            border-radius:9px;
                                            object-fit:cover;
                                            border:1px solid rgba(0,0,0,0.05);
                                        " />
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>
    `;
};