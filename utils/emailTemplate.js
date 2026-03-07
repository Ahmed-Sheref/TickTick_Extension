export const weeklyEmailTemplate = (contents) =>
{
    const articleCards = contents.map((c, index) => `
        <tr>
            <td style="padding: 20px 0;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow:hidden;">
                    
                    <!-- Article Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 16px 24px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <span style="background:rgba(255,255,255,0.2); color:#ffffff; font-size:11px; font-weight:600; padding:4px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:1px;">
                                            Article ${index + 1}
                                        </span>
                                    </td>
                                    <td align="right">
                                        <span style="color:rgba(255,255,255,0.7); font-size:11px;">
                                            ${new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Article Body -->
                    <tr>
                        <td style="padding: 24px;">
                            
                            <!-- Title -->
                            <h2 style="margin:0 0 8px 0; font-size:18px; font-weight:700; color:#1a1a2e; line-height:1.4;">
                                ${c.title}
                            </h2>

                            <!-- URL -->
                            <a href="${c.url}" style="color:#667eea; font-size:13px; text-decoration:none; display:block; margin-bottom:16px;">
                                🔗 ${c.url}
                            </a>

                            <!-- Summary -->
                            ${c.summary ? `
                            <div style="background:#f8f9ff; border-left:4px solid #667eea; border-radius:0 8px 8px 0; padding:16px; margin-bottom:16px;">
                                <p style="margin:0 0 8px 0; font-size:12px; font-weight:700; color:#667eea; text-transform:uppercase; letter-spacing:1px;">
                                    📝 Summary
                                </p>
                                <p style="margin:0; font-size:14px; color:#444; line-height:1.7;">
                                    ${c.summary}
                                </p>
                            </div>
                            ` : ''}

                            <!-- Tags -->
                            ${c.tags && c.tags.length > 0 ? `
                            <div style="margin-bottom:16px;">
                                ${c.tags.map(tag => `
                                    <span style="display:inline-block; background:#eef2ff; color:#667eea; font-size:11px; font-weight:600; padding:4px 10px; border-radius:20px; margin:2px 4px 2px 0;">
                                        #${tag}
                                    </span>
                                `).join('')}
                            </div>
                            ` : ''}

                            <!-- Quiz -->
                            ${c.quiz ? `
                            <div style="background:#fff8f0; border:1px solid #ffd4a3; border-radius:8px; padding:16px;">
                                <p style="margin:0 0 10px 0; font-size:12px; font-weight:700; color:#f59e0b; text-transform:uppercase; letter-spacing:1px;">
                                    🧠 Quiz
                                </p>
                                <p style="margin:0 0 10px 0; font-size:14px; font-weight:600; color:#1a1a2e;">
                                    ${c.quiz.question}
                                </p>
                                <table cellpadding="0" cellspacing="0">
                                    ${c.quiz.options.map((opt, i) => `
                                        <tr>
                                            <td style="padding:3px 0;">
                                                <span style="
                                                    display:inline-block;
                                                    font-size:13px;
                                                    color: ${opt === c.quiz.correctAnswer ? '#059669' : '#666'};
                                                    font-weight: ${opt === c.quiz.correctAnswer ? '700' : '400'};
                                                ">
                                                    ${opt === c.quiz.correctAnswer ? '✅' : '⚪'} ${opt}
                                                </span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </table>
                            </div>
                            ` : ''}

                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background:#f0f2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0">

                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:16px 16px 0 0; padding:40px; text-align:center;">
                                <h1 style="margin:0 0 8px 0; font-size:28px; font-weight:800; color:#ffffff;">
                                    📚 Weekly Digest
                                </h1>
                                <p style="margin:0; font-size:15px; color:rgba(255,255,255,0.8);">
                                    Your saved articles from this week
                                </p>
                                <div style="margin-top:20px; background:rgba(255,255,255,0.15); border-radius:30px; display:inline-block; padding:8px 20px;">
                                    <span style="color:#ffffff; font-size:14px; font-weight:600;">
                                        ${contents.length} Article${contents.length > 1 ? 's' : ''} Saved
                                    </span>
                                </div>
                            </td>
                        </tr>

                        <!-- Articles -->
                        <tr>
                            <td style="background:#f0f2f5; padding:24px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    ${articleCards}
                                </table>
                            </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:0 0 16px 16px; padding:30px; text-align:center;">
                                <p style="margin:0 0 8px 0; color:#ffffff; font-size:15px; font-weight:600;">
                                    Keep Learning! 🚀
                                </p>
                                <p style="margin:0; color:rgba(255,255,255,0.7); font-size:12px;">
                                    TickTick Extension • Weekly Knowledge Digest
                                </p>
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