export const weeklyEmailTemplate = (contents) =>
{
    // ─── helpers ───────────────────────────────────────────────────────────
    const fmt = (dateStr) =>
        new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // ─── article cards ─────────────────────────────────────────────────────
    const articleCards = contents.map((c, index) => `

        <!-- Article ${index + 1} -->
        <tr>
            <td style="padding: 0 0 16px 0;">
                <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#ffffff; border-radius:14px; border:1.5px solid #e8e8f0; overflow:hidden;">

                    <!-- Article number strip -->
                    <tr>
                        <td style="padding:12px 20px; border-bottom:1.5px solid #f0f0f6;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <span style="
                                            display:inline-block;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:10.5px;
                                            font-weight:700;
                                            letter-spacing:0.07em;
                                            text-transform:uppercase;
                                            color:#8e8ea8;
                                        ">Article ${index + 1}</span>
                                    </td>
                                    <td align="right">
                                        <span style="
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:11px;
                                            color:#b5b5cc;
                                        ">${fmt(c.createdAt)}</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:20px;">

                            <!-- Title -->
                            <h2 style="
                                margin:0 0 6px 0;
                                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                font-size:17px;
                                font-weight:700;
                                color:#1a1a22;
                                line-height:1.3;
                                letter-spacing:-0.02em;
                            ">${c.title}</h2>

                            <!-- URL -->
                            ${c.url ? `
                            <a href="${c.url}" style="
                                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                font-size:12.5px;
                                color:#4f62e8;
                                text-decoration:none;
                                display:block;
                                margin-bottom:16px;
                                word-break:break-all;
                                line-height:1.4;
                            ">${c.url}</a>
                            ` : '<div style="margin-bottom:16px;"></div>'}

                            <!-- Summary -->
                            ${c.summary ? `
                            <table width="100%" cellpadding="0" cellspacing="0"
                                style="margin-bottom:16px; background:#f7f7fb; border-radius:10px; border:1.5px solid #e8e8f0; overflow:hidden;">
                                <tr>
                                    <td style="
                                        padding:4px 14px;
                                        background:#f0f0f6;
                                        border-bottom:1.5px solid #e8e8f0;
                                    ">
                                        <span style="
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:10.5px;
                                            font-weight:700;
                                            letter-spacing:0.07em;
                                            text-transform:uppercase;
                                            color:#6b6b84;
                                        ">Summary</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:14px;">
                                        <p style="
                                            margin:0;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:13.5px;
                                            color:#3e3e50;
                                            line-height:1.65;
                                        ">${c.summary}</p>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}

                            <!-- Tags -->
                            ${c.tags && c.tags.length > 0 ? `
                            <div style="margin-bottom:16px; line-height:1.8;">
                                ${c.tags.map(tag => `<span style="
                                    display:inline-block;
                                    background:#eceffe;
                                    color:#4f62e8;
                                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                    font-size:11px;
                                    font-weight:600;
                                    padding:3px 9px;
                                    border-radius:999px;
                                    margin:2px 4px 2px 0;
                                ">#${tag}</span>`).join('')}
                            </div>
                            ` : ''}

                            <!-- Quiz -->
                            ${c.quiz ? `
                            <table width="100%" cellpadding="0" cellspacing="0"
                                style="background:#fafaf7; border-radius:10px; border:1.5px solid #e8e8e0; overflow:hidden;">
                                <tr>
                                    <td style="
                                        padding:4px 14px;
                                        background:#f5f5ef;
                                        border-bottom:1.5px solid #e8e8e0;
                                    ">
                                        <span style="
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:10.5px;
                                            font-weight:700;
                                            letter-spacing:0.07em;
                                            text-transform:uppercase;
                                            color:#6b6b84;
                                        ">Review Question</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:14px;">
                                        <p style="
                                            margin:0 0 12px 0;
                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                            font-size:13.5px;
                                            font-weight:600;
                                            color:#1a1a22;
                                            line-height:1.5;
                                        ">${c.quiz.question}</p>
                                        <table cellpadding="0" cellspacing="0">
                                            ${c.quiz.options.map((opt) => {
                                                const isCorrect = opt === c.quiz.correctAnswer;
                                                return `<tr>
                                                    <td style="padding:3px 0;">
                                                        <span style="
                                                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                                            font-size:13px;
                                                            color:${isCorrect ? '#16a34a' : '#6b6b84'};
                                                            font-weight:${isCorrect ? '600' : '400'};
                                                            display:block;
                                                            padding:2px 0;
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
<body style="margin:0; padding:0; background:#f0f0f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

    <!-- Outer wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f6; padding:36px 16px;">
        <tr>
            <td align="center">
                <!-- Content column -->
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

                    <!-- ── HEADER ── -->
                    <tr>
                        <td style="
                            background:#ffffff;
                            border-radius:14px 14px 0 0;
                            border:1.5px solid #e8e8f0;
                            border-bottom:none;
                            padding:32px 32px 28px;
                        ">
                            <!-- Brand row -->
                            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                <tr>
                                    <td style="vertical-align:middle; padding-right:12px;">
                                        <!-- brand icon -->
                                        <div style="
                                            width:36px;
                                            height:36px;
                                            background:#1a1a22;
                                            border-radius:10px;
                                            display:inline-block;
                                            text-align:center;
                                            line-height:36px;
                                            font-size:16px;
                                        ">✓</div>
                                    </td>
                                    <td style="vertical-align:middle;">
                                        <p style="
                                            margin:0 0 1px 0;
                                            font-size:10.5px;
                                            font-weight:700;
                                            letter-spacing:0.08em;
                                            text-transform:uppercase;
                                            color:#8e8ea8;
                                        ">Knowledge Workspace</p>
                                        <p style="
                                            margin:0;
                                            font-size:15px;
                                            font-weight:700;
                                            color:#1a1a22;
                                            letter-spacing:-0.01em;
                                        ">TickTick Extension</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Headline -->
                            <h1 style="
                                margin:0 0 8px 0;
                                font-size:26px;
                                font-weight:700;
                                color:#1a1a22;
                                letter-spacing:-0.025em;
                                line-height:1.2;
                            ">Your Weekly Digest</h1>
                            <p style="
                                margin:0 0 20px 0;
                                font-size:14px;
                                color:#6b6b84;
                                line-height:1.5;
                            ">Here are the ${contents.length} article${contents.length !== 1 ? 's' : ''} you saved this week — with AI summaries and review questions.</p>

                            <!-- Stats pill -->
                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="
                                        background:#f0f0f6;
                                        border:1.5px solid #e8e8f0;
                                        border-radius:999px;
                                        padding:6px 16px;
                                    ">
                                        <span style="
                                            font-size:12.5px;
                                            font-weight:600;
                                            color:#3e3e50;
                                            white-space:nowrap;
                                        ">${contents.length} article${contents.length !== 1 ? 's' : ''} saved this week</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- thin accent line under header -->
                    <tr>
                        <td style="
                            background:#1a1a22;
                            height:3px;
                            font-size:0;
                            line-height:0;
                        ">&nbsp;</td>
                    </tr>

                    <!-- ── ARTICLES ── -->
                    <tr>
                        <td style="
                            background:#f7f7fb;
                            border-left:1.5px solid #e8e8f0;
                            border-right:1.5px solid #e8e8f0;
                            padding:20px;
                        ">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                ${articleCards}
                            </table>
                        </td>
                    </tr>

                    <!-- ── FOOTER ── -->
                    <tr>
                        <td style="
                            background:#ffffff;
                            border-radius:0 0 14px 14px;
                            border:1.5px solid #e8e8f0;
                            border-top:none;
                            padding:20px 32px;
                        ">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <p style="
                                            margin:0 0 3px 0;
                                            font-size:12.5px;
                                            font-weight:600;
                                            color:#3e3e50;
                                        ">TickTick Extension</p>
                                        <p style="
                                            margin:0;
                                            font-size:11.5px;
                                            color:#b5b5cc;
                                        ">Weekly Knowledge Digest • Capture → Enrich → Review</p>
                                    </td>
                                    <td align="right" style="vertical-align:middle;">
                                        <span style="
                                            display:inline-block;
                                            width:28px;
                                            height:28px;
                                            background:#1a1a22;
                                            border-radius:8px;
                                            text-align:center;
                                            line-height:28px;
                                            font-size:13px;
                                            color:#ffffff;
                                        ">✓</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                </table>
                <!-- /content column -->
            </td>
        </tr>
    </table>

</body>
</html>
    `;
};