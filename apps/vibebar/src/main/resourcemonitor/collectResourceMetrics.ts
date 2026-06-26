import { freemem, totalmem, cpus } from 'node:os'
import { statfs } from 'node:fs/promises'
import type { ResourceSnapshot } from '@shared/types.js'

const BYTES_PER_GB = 1024 ** 3

interface CpuTimes {
  idle: number
  total: number
}

function readCpuTimes(): CpuTimes {
  let idle = 0
  let total = 0
  for (const cpu of cpus()) {
    idle += cpu.times.idle
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq
  }
  return { idle, total }
}

async function readDisk(path: string): Promise<ResourceSnapshot['disk']> {
  try {
    const fs = await statfs(path)
    const totalGb = (fs.blocks * fs.bsize) / BYTES_PER_GB
    const freeGb = (fs.bavail * fs.bsize) / BYTES_PER_GB
    return { freeGb, totalGb, path }
  } catch {
    return { freeGb: 0, totalGb: 0, path }
  }
}

/**
 * Samples OS resource usage for the floating widgets. CPU is a busy-percentage derived from the
 * delta between consecutive `os.cpus()` snapshots, so the sampler is stateful and must be reused
 * across polls (the first sample reports 0% until it has a baseline to compare against).
 */
export class ResourceSampler {
  private prevCpu: CpuTimes | null = null

  /**
   * @param diskPath Drive/folder to report free space for (active project root, or system drive).
   */
  async sample(diskPath: string): Promise<ResourceSnapshot> {
    const total = totalmem()
    const free = freemem()
    const usedGb = (total - free) / BYTES_PER_GB
    const totalGb = total / BYTES_PER_GB
    const usedPct = total > 0 ? ((total - free) / total) * 100 : 0

    const cpu = readCpuTimes()
    let usagePct = 0
    if (this.prevCpu) {
      const idleDelta = cpu.idle - this.prevCpu.idle
      const totalDelta = cpu.total - this.prevCpu.total
      usagePct = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0
    }
    this.prevCpu = cpu

    const disk = await readDisk(diskPath)
    const rssMb = process.memoryUsage().rss / (1024 * 1024)

    return {
      at: Date.now(),
      ram: { usedPct, usedGb, totalGb },
      cpu: { usagePct: Math.max(0, Math.min(100, usagePct)) },
      disk,
      appMem: { rssMb }
    }
  }
}
