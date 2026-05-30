declare module 'autocannon' {
  interface Options {
    url: string;
    connections?: number;
    duration?: number;
    pipelining?: number;
    workers?: number;
    maxConnectionRequests?: number;
    maxOverallRequests?: number;
    connectionRate?: number;
    overallRate?: number;
  }

  interface RequestResult {
    total: number;
    average: number;
  }

  interface LatencyResult {
    average: number;
    max: number;
    p99: number;
  }

  interface ThroughputResult {
    average: number;
  }

  interface Result {
    requests: RequestResult;
    latency: LatencyResult;
    throughput: ThroughputResult;
    errors: number;
  }

  type Callback = (err: Error | null, result: Result) => void;

  function autocannon(options: Options, callback: Callback): any;
  namespace autocannon {
    function track(instance: any, options?: { renderProgressBar?: boolean }): void;
  }

  export = autocannon;
}
