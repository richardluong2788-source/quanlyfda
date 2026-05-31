'use client'

import { useState, useEffect } from 'react'
import { StatisticsCharts } from '@/components/dashboard/statistics-charts'
import { getMonthlyStatistics, getYearlyOverview, getAvailableYears, type MonthlyStats, type YearlyOverview } from '@/app/actions/services'
import { Loader2, BarChart3 } from 'lucide-react'

export default function StatisticsPage() {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()])
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([])
  const [yearlyOverview, setYearlyOverview] = useState<YearlyOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadInitialData() {
      try {
        const years = await getAvailableYears()
        setAvailableYears(years)
        if (years.length > 0 && !years.includes(selectedYear)) {
          setSelectedYear(years[0])
        }
      } catch (error) {
        console.error('[v0] Error loading available years:', error)
      }
    }
    loadInitialData()
  }, [])

  useEffect(() => {
    async function loadStats() {
      setLoading(true)
      try {
        const [monthly, yearly] = await Promise.all([
          getMonthlyStatistics(selectedYear),
          getYearlyOverview(selectedYear),
        ])
        setMonthlyStats(monthly)
        setYearlyOverview(yearly)
      } catch (error) {
        console.error('[v0] Error loading statistics:', error)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [selectedYear])

  if (loading || !yearlyOverview) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Đang tải dữ liệu thống kê...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Thống kê</h1>
          <p className="text-muted-foreground">
            Phân tích dịch vụ theo tháng và năm
          </p>
        </div>
      </div>

      <StatisticsCharts
        monthlyStats={monthlyStats}
        yearlyOverview={yearlyOverview}
        availableYears={availableYears}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
      />
    </div>
  )
}
