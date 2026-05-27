interface EndpointMetrics {
	count: number;
	errorCount: number;
	totalLatencyMs: number;
	maxLatencyMs: number;
	lastStatus: number;
	statusCounts: Record<string, number>;
}

interface MonitoringState {
	startedAt: number;
	totalRequests: number;
	totalErrors: number;
	totalLatencyMs: number;
	endpoints: Record<string, EndpointMetrics>;
	errorCodes: Record<string, number>;
	recent: Array<{
		ts: string;
		method: string;
		path: string;
		status: number;
		latencyMs: number;
		code?: string;
	}>;
}

const globalKey = "__work_appt_monitoring__";

function getState(): MonitoringState {
	const g = globalThis as typeof globalThis & {
		[globalKey]?: MonitoringState;
	};
	if (!g[globalKey]) {
		g[globalKey] = {
			startedAt: Date.now(),
			totalRequests: 0,
			totalErrors: 0,
			totalLatencyMs: 0,
			endpoints: {},
			errorCodes: {},
			recent: [],
		};
	}
	return g[globalKey] as MonitoringState;
}

export function recordRequest(args: {
	method: string;
	path: string;
	status: number;
	latencyMs: number;
	code?: string;
}) {
	const state = getState();
	state.totalRequests += 1;
	state.totalLatencyMs += args.latencyMs;

	const key = `${args.method} ${args.path}`;
	if (!state.endpoints[key]) {
		state.endpoints[key] = {
			count: 0,
			errorCount: 0,
			totalLatencyMs: 0,
			maxLatencyMs: 0,
			lastStatus: 200,
			statusCounts: {},
		};
	}

	const endpoint = state.endpoints[key];
	endpoint.count += 1;
	endpoint.totalLatencyMs += args.latencyMs;
	endpoint.maxLatencyMs = Math.max(endpoint.maxLatencyMs, args.latencyMs);
	endpoint.lastStatus = args.status;
	endpoint.statusCounts[String(args.status)] =
		(endpoint.statusCounts[String(args.status)] || 0) + 1;

	if (args.status >= 400) {
		state.totalErrors += 1;
		endpoint.errorCount += 1;
	}

	if (args.code) {
		state.errorCodes[args.code] = (state.errorCodes[args.code] || 0) + 1;
	}

	state.recent.unshift({
		ts: new Date().toISOString(),
		method: args.method,
		path: args.path,
		status: args.status,
		latencyMs: args.latencyMs,
		...(args.code ? { code: args.code } : {}),
	});
	if (state.recent.length > 100) state.recent.length = 100;
}

export function getMonitoringSnapshot() {
	const state = getState();
	const avgLatencyMs =
		state.totalRequests > 0 ? state.totalLatencyMs / state.totalRequests : 0;
	const errorRate =
		state.totalRequests > 0 ? state.totalErrors / state.totalRequests : 0;

	const endpoints = Object.entries(state.endpoints).map(([endpoint, m]) => ({
		endpoint,
		count: m.count,
		errorCount: m.errorCount,
		errorRate: m.count > 0 ? m.errorCount / m.count : 0,
		avgLatencyMs: m.count > 0 ? m.totalLatencyMs / m.count : 0,
		maxLatencyMs: m.maxLatencyMs,
		lastStatus: m.lastStatus,
		statusCounts: m.statusCounts,
	}));

	return {
		uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000),
		startedAt: new Date(state.startedAt).toISOString(),
		totalRequests: state.totalRequests,
		totalErrors: state.totalErrors,
		errorRate,
		avgLatencyMs,
		errorCodes: state.errorCodes,
		endpoints,
		recent: state.recent,
	};
}
