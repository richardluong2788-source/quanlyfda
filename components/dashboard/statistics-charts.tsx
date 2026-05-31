'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  FileCheck,
  Utensils,
  Sparkles,
  Stethoscope,
  CheckCircle,
  Clock,
  BarChart3,
} from 'lucide-react'
import type { MonthlyStats, YearlyOverview } from '@/app/actions/services'

interface StatisticsChartsProps {
  monthlyStats: MonthlyStats[]
  yearlyOverview: YearlyOverview
  availableYears: number[]
  selectedYear: number
  onYearChange: (year: number) => void
}

const COLORS = {
  food: '#10b981', // emerald-500
  cosmetics: '#d946ef', // fuchsia-500
  medical_device: '#06b6d4', // cyan-500
  completed: '#22c55e', // green-500
  inProgress: '#f59e0b', // amber-500
  total: '#6366f1', // indigo-500
}

const PIE_COLORS = ['#10b981', '#d946ef', '#06b6d4']

export function StatisticsCharts({
  monthlyStats,
  yearlyOverview,
  availableYears,
  selectedYear,
  onYearChange,
}: StatisticsChartsProps) {
  // Calculate growth compared to last month
  const currentMonth = new Date().getMonth()
  const currentMonthData = monthlyStats[currentMonth]
  const lastMonthData = currentMonth > 0 ? monthlyStats[currentMonth - 1] : null
  const growth = lastMonthData && lastMonthData.total > 0
    ? ((currentMonthData.total - lastMonthData.total) / lastMonthData.total * 100).toFixed(1)
    : null

  // Pie chart data for service types
  const pieData = [
    { name: 'Thực phẩm', value: yearlyOverview.byServiceType.food, icon: Utensils },
    { name: 'Mỹ phẩm', value: yearlyOverview.byServiceType.cosmetics, icon: Sparkles },
    { name: 'Thiết bị Y tế', value: yearlyOverview.byServiceType.medical_device, icon: Stethoscope },
  ].filter(d => d.value > 0)

  // Status pie data
  const statusPieData = [
    { name: 'Hoàn thành', value: yearlyOverview.totalCompleted },
    { name: 'Đang xử lý', value: yearlyOverview.totalInProgress },
  ].filter(d => d.value > 0)

  const statusColors = [COLORS.completed, COLORS.inProgress]

  return (
    <div className="space-y-6">
      {/* Year Selector and Overview Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Thống kê dịch vụ</h2>
          <p className="text-muted-foreground">Phân tích chi tiết theo tháng và năm</p>
        </div>
        <Select
          value={selectedYear.toString()}
          onValueChange={(value) => onYearChange(parseInt(value))}
        >
          <SelectTrigger className="w-[150px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                Năm {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tổng dịch vụ năm {selectedYear}
            </CardTitle>
            <FileCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {yearlyOverview.totalServices}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {growth !== null && (
                <>
                  {parseFloat(growth) >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-success" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className={`text-xs ${parseFloat(growth) >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {growth}% so với tháng trước
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Đã hoàn thành
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {yearlyOverview.totalCompleted}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {yearlyOverview.totalServices > 0 
                ? ((yearlyOverview.totalCompleted / yearlyOverview.totalServices) * 100).toFixed(1)
                : 0}% tổng dịch vụ
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Trung bình/tháng
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {yearlyOverview.avgServicesPerMonth}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              dịch vụ mỗi tháng
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tháng cao điểm
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {yearlyOverview.peakMonth}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {yearlyOverview.peakMonthCount} dịch vụ
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Bar Chart */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-foreground">Số lượng dịch vụ theo tháng</CardTitle>
            <CardDescription>
              Biểu đồ phân bổ dịch vụ mới trong năm {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyStats} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="monthLabel" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickLine={{ stroke: 'hsl(var(--muted))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickLine={{ stroke: 'hsl(var(--muted))' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Bar dataKey="food" name="Thực phẩm" fill={COLORS.food} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cosmetics" name="Mỹ phẩm" fill={COLORS.cosmetics} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="medical_device" name="Thiết bị Y tế" fill={COLORS.medical_device} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Trend Line Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Xu hướng theo thời gian</CardTitle>
            <CardDescription>
              Tổng số dịch vụ mới theo từng tháng
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyStats} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.total} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.total} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="monthLabel" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    tickLine={{ stroke: 'hsl(var(--muted))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickLine={{ stroke: 'hsl(var(--muted))' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="total" 
                    name="Tổng dịch vụ"
                    stroke={COLORS.total} 
                    fillOpacity={1} 
                    fill="url(#colorTotal)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Service Type Pie Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Phân bổ theo loại dịch vụ</CardTitle>
            <CardDescription>
              Tỷ lệ các loại dịch vụ trong năm {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(value: number) => [`${value} dịch vụ`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Chưa có dữ liệu
                </div>
              )}
            </div>
            <div className="flex justify-center gap-4 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.food }} />
                <span className="text-sm text-muted-foreground">Thực phẩm</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.cosmetics }} />
                <span className="text-sm text-muted-foreground">Mỹ phẩm</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.medical_device }} />
                <span className="text-sm text-muted-foreground">Thiết bị Y tế</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Completed vs In Progress Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Trạng thái xử lý</CardTitle>
            <CardDescription>
              So sánh hoàn thành và đang xử lý theo tháng
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyStats} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="monthLabel" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    tickLine={{ stroke: 'hsl(var(--muted))' }}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickLine={{ stroke: 'hsl(var(--muted))' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="completed" name="Hoàn thành" fill={COLORS.completed} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="inProgress" name="Đang xử lý" fill={COLORS.inProgress} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status Overview Pie */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Tổng quan trạng thái</CardTitle>
            <CardDescription>
              Tỷ lệ hoàn thành trong năm {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {statusPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                    >
                      {statusPieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={statusColors[index]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(value: number) => [`${value} dịch vụ`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Chưa có dữ liệu
                </div>
              )}
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.completed }} />
                <span className="text-sm text-muted-foreground">Hoàn thành ({yearlyOverview.totalCompleted})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.inProgress }} />
                <span className="text-sm text-muted-foreground">Đang xử lý ({yearlyOverview.totalInProgress})</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Details Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Chi tiết từng tháng</CardTitle>
          <CardDescription>
            Bảng thống kê chi tiết số lượng dịch vụ theo tháng trong năm {selectedYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tháng</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Tổng</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                    <span className="flex items-center justify-end gap-1">
                      <Utensils className="h-3 w-3" /> Thực phẩm
                    </span>
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                    <span className="flex items-center justify-end gap-1">
                      <Sparkles className="h-3 w-3" /> Mỹ phẩm
                    </span>
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                    <span className="flex items-center justify-end gap-1">
                      <Stethoscope className="h-3 w-3" /> Thiết bị Y tế
                    </span>
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                    <span className="flex items-center justify-end gap-1">
                      <CheckCircle className="h-3 w-3" /> Hoàn thành
                    </span>
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                    <span className="flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" /> Đang xử lý
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyStats.map((month, index) => (
                  <tr 
                    key={month.month} 
                    className={`border-b border-border/50 hover:bg-secondary/30 ${
                      index === new Date().getMonth() && selectedYear === new Date().getFullYear()
                        ? 'bg-primary/5'
                        : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-medium text-foreground">
                      {month.monthLabel}
                      {index === new Date().getMonth() && selectedYear === new Date().getFullYear() && (
                        <Badge variant="outline" className="ml-2 text-xs">Hiện tại</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-foreground">{month.total}</td>
                    <td className="py-3 px-4 text-right text-emerald-400">{month.food}</td>
                    <td className="py-3 px-4 text-right text-fuchsia-400">{month.cosmetics}</td>
                    <td className="py-3 px-4 text-right text-cyan-400">{month.medical_device}</td>
                    <td className="py-3 px-4 text-right text-success">{month.completed}</td>
                    <td className="py-3 px-4 text-right text-warning">{month.inProgress}</td>
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="bg-secondary/50 font-semibold">
                  <td className="py-3 px-4 text-foreground">Tổng cộng</td>
                  <td className="py-3 px-4 text-right text-foreground">{yearlyOverview.totalServices}</td>
                  <td className="py-3 px-4 text-right text-emerald-400">{yearlyOverview.byServiceType.food}</td>
                  <td className="py-3 px-4 text-right text-fuchsia-400">{yearlyOverview.byServiceType.cosmetics}</td>
                  <td className="py-3 px-4 text-right text-cyan-400">{yearlyOverview.byServiceType.medical_device}</td>
                  <td className="py-3 px-4 text-right text-success">{yearlyOverview.totalCompleted}</td>
                  <td className="py-3 px-4 text-right text-warning">{yearlyOverview.totalInProgress}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
