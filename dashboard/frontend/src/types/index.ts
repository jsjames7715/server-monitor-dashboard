export interface Server {
  server_id: string;
  hostname: string;
  system: string;
  registered_at: string;
  last_seen: string;
  status: 'online' | 'offline';
  current_metrics: ServerMetrics | null;
}

export interface ServerMetrics {
  timestamp: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics[];
  network: NetworkMetrics;
  gpu: GpuMetrics | null;
  temperature: TemperatureMetrics;
  processes: ProcessInfo[];
  system: SystemInfo;
}

export interface CpuMetrics {
  total: number;
  per_core: number[];
  count: number;
  frequency_current: number;
  frequency_min: number;
  frequency_max: number;
}

export interface MemoryMetrics {
  total: number;
  available: number;
  used: number;
  free: number;
  percent: number;
  swap_total: number;
  swap_used: number;
  swap_percent: number;
}

export interface DiskMetrics {
  device: string;
  mountpoint: string;
  filesystem: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface NetworkMetrics {
  bytes_sent: number;
  bytes_recv: number;
  total_sent: number;
  total_recv: number;
  packets_sent: number;
  packets_recv: number;
}

export interface GpuMetrics {
  available: boolean;
  utilization_gpu: number;
  utilization_memory: number;
  memory_used: number;
  memory_total: number;
  temperature: number;
  power_draw: number;
}

export interface TemperatureMetrics {
  cpu: CpuTemperature[];
  gpu: number | null;
  system: unknown[];
  raw_sensors?: string;
}

export interface CpuTemperature {
  label: string;
  current: number;
  high: number;
  critical: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
  status: string;
  username: string;
}

export interface SystemInfo {
  hostname: string;
  os: {
    system: string;
    release: string;
    version: string;
    machine: string;
  };
  boot_time: string;
  uptime_seconds: number;
  uptime_hours: number;
}

export interface CommandRequest {
  type: string;
  id?: string;
  pid?: number;
  path?: string;
}

export interface FileInfo {
  name: string;
  size: number;
  isdir: boolean;
  modified: string;
}

export interface AlertThreshold {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  gpuTemp: number;
  cpuTemp: number;
  enabled: boolean;
}

export interface Alert {
  type: string;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  mountpoint?: string;
  label?: string;
}

export interface ServerTag {
  name: string;
  serverIds: string[];
}