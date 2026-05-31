'use server'

import { query } from '@/lib/db'

// Get monthly statistics for services
export interface MonthlyStats {
  month: string // YYYY-MM format
  monthLabel: string // Vietnamese month label
  total: number
  food: number
  cosmetics: number
  medical_device: number
  completed: number
  inProgress: number
}

export async function getMonthlyStatistics(year?: number): Promise<MonthlyStats[]> {
  const targetYear = year || new Date().getFullYear()
  
  // Fetch all services for the year using direct Postgres
  const startDate = `${targetYear}-01-01`
  const endDate = `${targetYear}-12-31`
  
  try {
    const result = await query(
      `SELECT id, created_at, service_type, current_stage 
       FROM services 
       WHERE created_at >= $1 AND created_at <= $2 
       ORDER BY created_at ASC`,
      [startDate, endDate]
    )

    const data = result.rows

    // Vietnamese month labels
    const monthLabels = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ]

    // Initialize stats for all 12 months
    const monthlyStats: MonthlyStats[] = Array.from({ length: 12 }, (_, i) => ({
      month: `${targetYear}-${String(i + 1).padStart(2, '0')}`,
      monthLabel: monthLabels[i],
      total: 0,
      food: 0,
      cosmetics: 0,
      medical_device: 0,
      completed: 0,
      inProgress: 0,
    }))

    // Aggregate data by month
    data?.forEach((service: { created_at: string; service_type: string; current_stage: string }) => {
      const createdDate = new Date(service.created_at)
      const monthIndex = createdDate.getMonth()
      
      monthlyStats[monthIndex].total++
      
      // Count by service type
      if (service.service_type === 'food') {
        monthlyStats[monthIndex].food++
      } else if (service.service_type === 'cosmetics') {
        monthlyStats[monthIndex].cosmetics++
      } else if (service.service_type === 'medical_device') {
        monthlyStats[monthIndex].medical_device++
      }
      
      // Count completed vs in progress
      if (service.current_stage === 'completion_handover' || service.current_stage === 'renewal_support') {
        monthlyStats[monthIndex].completed++
      } else {
        monthlyStats[monthIndex].inProgress++
      }
    })

    return monthlyStats
  } catch (error) {
    console.error('[v0] Error fetching monthly stats:', error)
    return []
  }
}

// Get yearly overview statistics
export interface YearlyOverview {
  year: number
  totalServices: number
  totalCompleted: number
  totalInProgress: number
  byServiceType: {
    food: number
    cosmetics: number
    medical_device: number
  }
  byStage: Record<string, number>
  avgServicesPerMonth: number
  peakMonth: string
  peakMonthCount: number
}

export async function getYearlyOverview(year?: number): Promise<YearlyOverview> {
  const targetYear = year || new Date().getFullYear()
  
  const startDate = `${targetYear}-01-01`
  const endDate = `${targetYear}-12-31`
  
  try {
    const result = await query(
      `SELECT id, created_at, service_type, current_stage 
       FROM services 
       WHERE created_at >= $1 AND created_at <= $2`,
      [startDate, endDate]
    )

    const data = result.rows

    const monthLabels = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ]

    const monthCounts = Array(12).fill(0)
    const byServiceType = { food: 0, cosmetics: 0, medical_device: 0 }
    const byStage: Record<string, number> = {}
    let totalCompleted = 0
    let totalInProgress = 0

    data?.forEach((service: { created_at: string; service_type: string; current_stage: string }) => {
      const monthIndex = new Date(service.created_at).getMonth()
      monthCounts[monthIndex]++
      
      // Count by type
      if (service.service_type in byServiceType) {
        byServiceType[service.service_type as keyof typeof byServiceType]++
      }
      
      // Count by stage
      byStage[service.current_stage] = (byStage[service.current_stage] || 0) + 1
      
      // Count completed/in progress
      if (service.current_stage === 'completion_handover' || service.current_stage === 'renewal_support') {
        totalCompleted++
      } else {
        totalInProgress++
      }
    })

    // Find peak month
    const maxCount = Math.max(...monthCounts)
    const peakMonthIndex = monthCounts.indexOf(maxCount)

    return {
      year: targetYear,
      totalServices: data?.length || 0,
      totalCompleted,
      totalInProgress,
      byServiceType,
      byStage,
      avgServicesPerMonth: data?.length ? Math.round((data.length / 12) * 10) / 10 : 0,
      peakMonth: maxCount > 0 ? monthLabels[peakMonthIndex] : 'N/A',
      peakMonthCount: maxCount,
    }
  } catch (error) {
    console.error('[v0] Error fetching yearly overview:', error)
    return {
      year: targetYear,
      totalServices: 0,
      totalCompleted: 0,
      totalInProgress: 0,
      byServiceType: { food: 0, cosmetics: 0, medical_device: 0 },
      byStage: {},
      avgServicesPerMonth: 0,
      peakMonth: '',
      peakMonthCount: 0,
    }
  }
}

// Get available years for statistics
export async function getAvailableYears(): Promise<number[]> {
  try {
    const result = await query(
      `SELECT DISTINCT EXTRACT(YEAR FROM created_at) as year 
       FROM services 
       ORDER BY year DESC`
    )

    if (!result.rows?.length) {
      return [new Date().getFullYear()]
    }

    return result.rows.map((row: { year: number }) => Number(row.year))
  } catch (error) {
    console.error('[v0] Error fetching available years:', error)
    return [new Date().getFullYear()]
  }
}
