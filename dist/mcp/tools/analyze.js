import { logger } from '../../utils/logger.js';
export function analyzeTool(clients) {
    return {
        name: 'analyze',
        description: 'Analyze memory patterns and extract insights',
        inputSchema: {
            type: 'object',
            properties: {
                timeRange: {
                    type: 'string',
                    description: 'Time range to analyze (e.g., "day", "week", "month", "all")',
                    enum: ['day', 'week', 'month', 'all']
                }
            }
        },
        handler: async (args) => {
            try {
                const { timeRange } = args;
                // Build request - the backend will handle the actual analysis logic
                const request = {
                    userId: await clients.auth.getCurrentUserId()
                };
                // The backend expects a simple string for time range
                if (timeRange && timeRange !== 'all') {
                    // The PatternServiceClient expects a timeRange object with start/end dates
                    // but the backend's analyze_patterns expects a string like "day", "week", "month"
                    // So we need to convert to the proto format
                    const now = new Date();
                    const start = new Date();
                    switch (timeRange) {
                        case 'day':
                            start.setDate(now.getDate() - 1);
                            break;
                        case 'week':
                            start.setDate(now.getDate() - 7);
                            break;
                        case 'month':
                            start.setDate(now.getDate() - 30);
                            break;
                    }
                    request.timeRange = { start, end: now };
                }
                logger.debug('Analyzing patterns with request:', request);
                // Call the pattern service
                const response = await clients.pattern.analyzePatterns(request);
                // Format the response
                let result = `# Pattern Analysis Results\n\n`;
                if (response.totalMemoriesAnalyzed > 0) {
                    result += `Analyzed **${response.totalMemoriesAnalyzed}** memories\n\n`;
                }
                // Summary
                if (response.summary) {
                    result += `## Summary\n`;
                    result += `- Total patterns found: ${response.summary.totalPatterns}\n`;
                    result += `- Overall consistency: ${(response.summary.overallConsistency * 100).toFixed(1)}%\n`;
                    if (Object.keys(response.summary.patternsByType).length > 0) {
                        result += `\n### Patterns by Type:\n`;
                        for (const [type, count] of Object.entries(response.summary.patternsByType)) {
                            result += `- ${type}: ${count}\n`;
                        }
                    }
                    result += '\n';
                }
                // Insights
                if (response.insights.length > 0) {
                    result += `## Key Insights\n`;
                    response.insights.forEach(insight => {
                        result += `- ${insight}\n`;
                    });
                    result += '\n';
                }
                // Patterns
                if (response.patterns.length > 0) {
                    result += `## Detected Patterns\n\n`;
                    // Group patterns by type for better readability
                    const patternsByType = {};
                    response.patterns.forEach(pattern => {
                        const type = pattern.patternType || 'Unknown';
                        if (!patternsByType[type]) {
                            patternsByType[type] = [];
                        }
                        patternsByType[type].push(pattern);
                    });
                    for (const [type, patterns] of Object.entries(patternsByType)) {
                        result += `### ${type}\n`;
                        patterns.forEach(pattern => {
                            result += `- **${pattern.description}**\n`;
                            result += `  - Confidence: ${(pattern.confidence * 100).toFixed(1)}%\n`;
                            result += `  - Occurrences: ${pattern.occurrenceCount}\n`;
                        });
                        result += '\n';
                    }
                }
                else {
                    result += 'No significant patterns detected in the specified time range.\n';
                }
                return [{
                        type: 'text',
                        text: result
                    }];
            }
            catch (error) {
                logger.error('Error analyzing patterns:', error);
                throw error;
            }
        }
    };
}
//# sourceMappingURL=analyze.js.map