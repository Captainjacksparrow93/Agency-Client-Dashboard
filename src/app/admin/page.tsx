'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import AppLayout from '@/components/layout/AppLayout'
import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'
import {
  Users, FolderKanban, IndianRupee, Clock, CheckCircle2, Timer,
  Loader2, ArrowRight, MessageSquare, AlertCircle, Eye, XCircle,
  BarChart3, TrendingUp, ArrowUpRight, ArrowDownRight, Plus,
  Pencil, Trash2, Shield, UserPlus, PackagePlus, Building2,
  Mail, Phone, Briefcase, ToggleLeft, ToggleRight, Search,
  ChevronDown, Activity, Percent, Wallet, RefreshCw, UserCog,
  LayoutDashboard, ListTodo, Settings, UserCheck, PlusCircle, MinusCircle
} from 'lucide-react'

// ────────────────────────────────────────────
// Type definitions
// ────────────────────────────────────────────
type Section = 'overview' | 'tasks' | 'services' | 'team' | 'clients' | 'employees'

interface Stats {
  totalUsers: number
  totalTasks: number
  pendingTasks: number
  inProgressTasks: number
  completedTasks: number
  reviewTasks: number
  cancelledTasks: number
  totalRevenue: number
  totalSpent: number
  teamMembers: number
  activeServices: number
  recentTransactions: Transaction[]
  avgTaskCost: number
  retainerTasks: number
  completionRate: number
}

interface Transaction {
  id: string
  type: 'credit' | 'debit'
  amount: number
  description: string
  createdAt: string
  user?: { name: string; email?: string }
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  totalCost: number
  createdAt: string
  dueDate?: string
  etaHours?: number
  etaStartedAt?: string
  etaExtendedBy: number
  progressPct: number
  isRetainer: boolean
  user: { name: string; email?: string; company?: string }
  assignedPm?: { id: string; name: string; email: string } | null
  items: any[]
  _count: { messages: number }
}

interface ServiceItem {
  id: string
  name: string
  description: string
  category: string
  price: number
  unit: string
  isActive: boolean
  sortOrder: number
}

interface TeamMember {
  id: string
  name: string
  email: string | null
  role: string
  permissions: string
  createdAt: string
  _count: { assignedTasks: number }
}

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  wallet: { balance: number } | null
  _count: { tasks: number }
  createdAt: string
}

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────
const statusConfig: Record<string, { label: string; class: string; icon: any }> = {
  pending: { label: 'Pending', class: 'badge-pending', icon: Clock },
  in_progress: { label: 'In Progress', class: 'badge-in-progress', icon: Timer },
  review: { label: 'In Review', class: 'badge-review', icon: Eye },
  completed: { label: 'Completed', class: 'badge-completed', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', class: 'badge-cancelled', icon: XCircle },
}

const PERMISSION_OPTIONS = [
  { key: 'task_update', label: 'Update Tasks' },
  { key: 'eta_manage', label: 'Manage ETAs' },
  { key: 'chat', label: 'Chat' },
  { key: 'view_tasks', label: 'View Tasks' },
]

const sectionTabs: { key: Section; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'tasks', label: 'Tasks', icon: ListTodo },
  { key: 'services', label: 'Services', icon: Settings },
  { key: 'team', label: 'Team (PM)', icon: UserCog },
  { key: 'employees', label: 'Employees', icon: Users },
  { key: 'clients', label: 'Clients', icon: Building2 },
]

// ────────────────────────────────────────────
// Utility helpers
// ────────────────────────────────────────────
function formatCurrency(amount: number) {
  return `\u20B9${amount.toLocaleString('en-IN')}`
}

function parsePermissions(raw: string): string[] {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function computeEtaProgress(task: Task): number {
  if (!task.etaHours || !task.etaStartedAt) return 0
  const totalMs = (task.etaHours + task.etaExtendedBy) * 3600 * 1000
  const elapsedMs = Date.now() - new Date(task.etaStartedAt).getTime()
  return Math.min(100, Math.round((elapsedMs / totalMs) * 100))
}

function etaRemaining(task: Task): string {
  if (!task.etaHours || !task.etaStartedAt) return '--'
  const totalMs = (task.etaHours + task.etaExtendedBy) * 3600 * 1000
  const elapsedMs = Date.now() - new Date(task.etaStartedAt).getTime()
  const remainMs = totalMs - elapsedMs
  if (remainMs <= 0) return 'Overdue'
  const hrs = Math.floor(remainMs / 3600000)
  const mins = Math.floor((remainMs % 3600000) / 60000)
  return hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`
}

// ═════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════
export default function AdminDashboard() {
  const { user } = useAuth()

  // Shared state
  const [activeSection, setActiveSection] = useState<Section>('overview')
  const [loading, setLoading] = useState(true)

  // Overview state
  const [stats, setStats] = useState<Stats | null>(null)

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskFilter, setTaskFilter] = useState('all')

  // Services state
  const [services, setServices] = useState<ServiceItem[]>([])
  const [showAddService, setShowAddService] = useState(false)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', category: '', price: '', unit: 'per piece' })

  // Team state
  const [team, setTeam] = useState<TeamMember[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [memberForm, setMemberForm] = useState({ name: '', email: '', role: 'pm', permissions: ['task_update', 'eta_manage', 'chat', 'view_tasks'] })

  // Clients state
  const [clients, setClients] = useState<Client[]>([])
  const [showAddClient, setShowAddClient] = useState(false)
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '', company: '', walletBalance: '' })
  const [retainerItems, setRetainerItems] = useState<{ serviceItemId: string; quantity: number }[]>([])
  const [availableServices, setAvailableServices] = useState<ServiceItem[]>([])

  // Wallet adjustment modal
  const [walletModal, setWalletModal] = useState<{ client: Client } | null>(null)
  const [walletForm, setWalletForm] = useState({ type: 'credit', amount: '', description: '' })
  const [savingWallet, setSavingWallet] = useState(false)

  // Admin-create-task modal
  const [taskModal, setTaskModal] = useState<{ client: Client } | null>(null)
  const [adminTaskForm, setAdminTaskForm] = useState({ title: '', description: '', priority: 'medium' })
  const [adminTaskItems, setAdminTaskItems] = useState<{ serviceItemId: string; quantity: number }[]>([])
  const [savingAdminTask, setSavingAdminTask] = useState(false)

  // Employees state
  const [employees, setEmployees] = useState<any[]>([])
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [empForm, setEmpForm] = useState({ name: '', email: '', password: '', employeeRole: '' })
  const [savingEmployee, setSavingEmployee] = useState(false)

  // ────────────────────────────────────────────
  // Data fetching
  // ────────────────────────────────────────────
  const fetchOverviewData = useCallback(async () => {
    try {
      const [statsRes, tasksRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/tasks'),
      ])
      if (!statsRes.ok || !tasksRes.ok) throw new Error()
      const [statsData, tasksData] = await Promise.all([statsRes.json(), tasksRes.json()])
      setStats(statsData)
      setTasks(tasksData.tasks || [])
    } catch {
      toast.error('Failed to load dashboard data')
    }
  }, [])

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/services')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setServices(data.services || [])
    } catch {
      toast.error('Failed to load services')
    }
  }, [])

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/team')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setTeam(data.team || [])
    } catch {
      toast.error('Failed to load team')
    }
  }, [])

  const fetchClients = useCallback(async () => {
    try {
      const [usersRes, servicesRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/services'),
      ])
      if (!usersRes.ok) throw new Error()
      const usersData = await usersRes.json()
      setClients(usersData.users || [])
      if (servicesRes.ok) {
        const svcData = await servicesRes.json()
        setAvailableServices(svcData.services || [])
      }
    } catch {
      toast.error('Failed to load clients')
    }
  }, [])

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees')
      if (res.ok) {
        const data = await res.json()
        setEmployees(data.employees || [])
      }
    } catch {
      toast.error('Failed to load employees')
    }
  }, [])

  async function createEmployee() {
    if (!empForm.name.trim() || !empForm.email.trim() || !empForm.password.trim()) {
      toast.error('Name, email and password are required')
      return
    }
    setSavingEmployee(true)
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(empForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create employee')
      toast.success(`Employee ${data.employee.name} created`)
      setShowAddEmployee(false)
      setEmpForm({ name: '', email: '', password: '', employeeRole: '' })
      fetchEmployees()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSavingEmployee(false)
    }
  }

  // Initial load + section-based loading
  useEffect(() => {
    if (user?.role !== 'admin') {
      setLoading(false)
      return
    }
    setLoading(true)
    const loadSection = async () => {
      switch (activeSection) {
        case 'overview':
          await fetchOverviewData()
          break
        case 'tasks':
          await fetchOverviewData()
          break
        case 'services':
          await fetchServices()
          break
        case 'team':
          await fetchTeam()
          break
        case 'clients':
          await fetchClients()
          break
        case 'employees':
          await fetchEmployees()
          break
      }
      setLoading(false)
    }
    loadSection()
  }, [user, activeSection, fetchOverviewData, fetchServices, fetchTeam, fetchClients])

  // ────────────────────────────────────────────
  // Task actions
  // ────────────────────────────────────────────
  async function updateTaskStatus(taskId: string, status: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success('Status updated')
      await fetchOverviewData()
    } catch {
      toast.error('Failed to update status')
    }
  }

  // ────────────────────────────────────────────
  // Service CRUD
  // ────────────────────────────────────────────
  function resetServiceForm() {
    setServiceForm({ name: '', description: '', category: '', price: '', unit: 'per piece' })
    setShowAddService(false)
    setEditingServiceId(null)
  }

  async function handleSaveService() {
    if (!serviceForm.name || !serviceForm.category || !serviceForm.price) {
      toast.error('Name, category, and price are required')
      return
    }
    try {
      const url = editingServiceId ? `/api/admin/services/${editingServiceId}` : '/api/admin/services'
      const method = editingServiceId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: serviceForm.name,
          description: serviceForm.description,
          category: serviceForm.category,
          price: parseFloat(serviceForm.price),
          unit: serviceForm.unit,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(editingServiceId ? 'Service updated' : 'Service created')
      resetServiceForm()
      await fetchServices()
    } catch {
      toast.error('Failed to save service')
    }
  }

  async function toggleServiceActive(svc: ServiceItem) {
    try {
      const res = await fetch(`/api/admin/services/${svc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !svc.isActive }),
      })
      if (!res.ok) throw new Error()
      toast.success(svc.isActive ? 'Service deactivated' : 'Service activated')
      await fetchServices()
    } catch {
      toast.error('Failed to toggle service')
    }
  }

  async function deleteService(id: string) {
    if (!confirm('Deactivate this service?')) return
    try {
      const res = await fetch(`/api/admin/services/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Service deactivated')
      await fetchServices()
    } catch {
      toast.error('Failed to delete service')
    }
  }

  function startEditService(svc: ServiceItem) {
    setEditingServiceId(svc.id)
    setServiceForm({
      name: svc.name,
      description: svc.description,
      category: svc.category,
      price: svc.price.toString(),
      unit: svc.unit,
    })
    setShowAddService(true)
  }

  // ────────────────────────────────────────────
  // Team CRUD
  // ────────────────────────────────────────────
  function resetMemberForm() {
    setMemberForm({ name: '', email: '', role: 'pm', permissions: ['task_update', 'eta_manage', 'chat', 'view_tasks'] })
    setShowAddMember(false)
    setEditingMemberId(null)
  }

  async function handleSaveMember() {
    if (!memberForm.name || !memberForm.email) {
      toast.error('Name and email are required')
      return
    }
    try {
      const url = editingMemberId ? `/api/admin/team/${editingMemberId}` : '/api/admin/team'
      const method = editingMemberId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: memberForm.name,
          email: memberForm.email,
          role: memberForm.role,
          permissions: memberForm.permissions,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success(editingMemberId ? 'Member updated' : 'Member added')
      resetMemberForm()
      await fetchTeam()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save member')
    }
  }

  async function deleteMember(id: string) {
    if (!confirm('Remove this team member? Their tasks will be unassigned.')) return
    try {
      const res = await fetch(`/api/admin/team/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success('Member removed')
      await fetchTeam()
    } catch (e: any) {
      toast.error(e.message || 'Failed to remove member')
    }
  }

  function startEditMember(m: TeamMember) {
    setEditingMemberId(m.id)
    setMemberForm({
      name: m.name,
      email: m.email || '',
      role: m.role,
      permissions: parsePermissions(m.permissions),
    })
    setShowAddMember(true)
  }

  function togglePermission(perm: string) {
    setMemberForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }))
  }

  // ────────────────────────────────────────────
  // Client CRUD
  // ────────────────────────────────────────────
  function resetClientForm() {
    setClientForm({ name: '', email: '', phone: '', company: '', walletBalance: '' })
    setRetainerItems([])
    setShowAddClient(false)
  }

  async function handleSaveClient() {
    if (!clientForm.name || (!clientForm.email && !clientForm.phone)) {
      toast.error('Name and email or phone are required')
      return
    }
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clientForm.name,
          email: clientForm.email || undefined,
          phone: clientForm.phone || undefined,
          company: clientForm.company || undefined,
          walletBalance: clientForm.walletBalance ? parseFloat(clientForm.walletBalance) : 0,
          retainerItems: retainerItems.filter(r => r.serviceItemId && r.quantity > 0),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success('Client added')
      resetClientForm()
      await fetchClients()
    } catch (e: any) {
      toast.error(e.message || 'Failed to add client')
    }
  }

  function addRetainerRow() {
    setRetainerItems(prev => [...prev, { serviceItemId: '', quantity: 1 }])
  }

  function updateRetainerRow(index: number, field: string, value: any) {
    setRetainerItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function removeRetainerRow(index: number) {
    setRetainerItems(prev => prev.filter((_, i) => i !== index))
  }

  // ────────────────────────────────────────────
  // Wallet adjustment
  // ────────────────────────────────────────────
  function openWalletModal(client: Client) {
    setWalletModal({ client })
    setWalletForm({ type: 'credit', amount: '', description: '' })
  }

  async function handleWalletAdjust() {
    if (!walletModal || !walletForm.amount || parseFloat(walletForm.amount) <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setSavingWallet(true)
    try {
      const res = await fetch(`/api/admin/clients/${walletModal.client.id}/wallet`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: walletForm.type,
          amount: parseFloat(walletForm.amount),
          description: walletForm.description || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`Wallet ${walletForm.type === 'credit' ? 'credited' : 'debited'} successfully`)
      setWalletModal(null)
      await fetchClients()
    } catch (err: any) {
      toast.error(err.message || 'Failed to adjust wallet')
    } finally {
      setSavingWallet(false)
    }
  }

  // ────────────────────────────────────────────
  // Admin task creation for client
  // ────────────────────────────────────────────
  function openTaskModal(client: Client) {
    setTaskModal({ client })
    setAdminTaskForm({ title: '', description: '', priority: 'medium' })
    setAdminTaskItems([])
  }

  function addAdminTaskItem() {
    setAdminTaskItems(prev => [...prev, { serviceItemId: '', quantity: 1 }])
  }

  function updateAdminTaskItem(index: number, field: string, value: any) {
    setAdminTaskItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function removeAdminTaskItem(index: number) {
    setAdminTaskItems(prev => prev.filter((_, i) => i !== index))
  }

  async function handleCreateAdminTask() {
    if (!taskModal) return
    if (!adminTaskForm.title.trim()) {
      toast.error('Task title is required')
      return
    }
    if (adminTaskItems.length === 0 || adminTaskItems.some(i => !i.serviceItemId)) {
      toast.error('Add at least one service item')
      return
    }
    setSavingAdminTask(true)
    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: taskModal.client.id,
          title: adminTaskForm.title,
          description: adminTaskForm.description,
          priority: adminTaskForm.priority,
          items: adminTaskItems.filter(i => i.serviceItemId && i.quantity > 0),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success('Task created for client')
      setTaskModal(null)
      await fetchClients()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create task')
    } finally {
      setSavingAdminTask(false)
    }
  }

  // ────────────────────────────────────────────
  // Access guard & loading
  // ────────────────────────────────────────────
  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AppLayout>
    )
  }

  if (user?.role !== 'admin') {
    return (
      <AppLayout>
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-500 mt-2">You need admin privileges to view this page.</p>
        </div>
      </AppLayout>
    )
  }

  // ────────────────────────────────────────────
  // Computed values
  // ────────────────────────────────────────────
  const filteredTasks = taskFilter === 'all' ? tasks : tasks.filter(t => t.status === taskFilter)

  // ═════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════
  return (
    <AppLayout>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold gradient-text">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Manage your agency operations</p>
      </div>

      {/* ── Section Tabs ── */}
      <div className="flex gap-1 mb-8 overflow-x-auto pb-2 border-b border-gray-200">
        {sectionTabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeSection === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all rounded-t-lg border-b-2 ${
                isActive
                  ? 'border-blue-600 text-blue-600 bg-blue-50/60'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* OVERVIEW SECTION                       */}
      {/* ═══════════════════════════════════════ */}
      {activeSection === 'overview' && stats && (
        <div className="space-y-8 animate-in fade-in">
          {/* Analytics grid 2x4 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Clients */}
            <div className="card group hover:border-blue-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
                  <p className="text-sm text-gray-500">Total Clients</p>
                </div>
              </div>
            </div>

            {/* Pending Tasks */}
            <div className="card group hover:border-amber-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.pendingTasks}</p>
                  <p className="text-sm text-gray-500">Pending Tasks</p>
                </div>
              </div>
            </div>

            {/* In Progress */}
            <div className="card group hover:border-indigo-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <Timer className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.inProgressTasks}</p>
                  <p className="text-sm text-gray-500">In Progress</p>
                </div>
              </div>
            </div>

            {/* Completed */}
            <div className="card group hover:border-green-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center group-hover:bg-green-100 transition-colors">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.completedTasks}</p>
                  <p className="text-sm text-gray-500">Completed</p>
                </div>
              </div>
            </div>

            {/* Review */}
            <div className="card group hover:border-purple-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                  <Eye className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.reviewTasks}</p>
                  <p className="text-sm text-gray-500">In Review</p>
                </div>
              </div>
            </div>

            {/* Total Revenue */}
            <div className="card group hover:border-emerald-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <IndianRupee className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalRevenue)}</p>
                  <p className="text-sm text-gray-500">Total Revenue</p>
                </div>
              </div>
            </div>

            {/* Avg Task Cost */}
            <div className="card group hover:border-cyan-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center group-hover:bg-cyan-100 transition-colors">
                  <BarChart3 className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.avgTaskCost)}</p>
                  <p className="text-sm text-gray-500">Avg Task Cost</p>
                </div>
              </div>
            </div>

            {/* Completion Rate */}
            <div className="card group hover:border-rose-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center group-hover:bg-rose-100 transition-colors">
                  <Percent className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.completionRate}%</p>
                  <p className="text-sm text-gray-500">Completion Rate</p>
                </div>
              </div>
            </div>
          </div>

          {/* Revenue + Retainers + Team row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Revenue Summary */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Revenue Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Total Credited</span>
                  <span className="font-semibold text-green-600">{formatCurrency(stats.totalRevenue)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Total Debited</span>
                  <span className="font-semibold text-red-500">{formatCurrency(stats.totalSpent)}</span>
                </div>
                <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Net Revenue</span>
                  <span className="font-bold text-gray-900">{formatCurrency(stats.totalRevenue - stats.totalSpent)}</span>
                </div>
              </div>
            </div>

            {/* Active Retainers */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-500" />
                Active Retainers
              </h3>
              <p className="text-3xl font-bold text-gray-900">{stats.retainerTasks}</p>
              <p className="text-sm text-gray-500 mt-1">Monthly retainer packages running</p>
            </div>

            {/* Team Size */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-500" />
                Team Size
              </h3>
              <p className="text-3xl font-bold text-gray-900">{stats.teamMembers}</p>
              <p className="text-sm text-gray-500 mt-1">Admins & project managers</p>
            </div>
          </div>

          {/* Recent Transactions */}
          {stats.recentTransactions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Transactions</h2>
              <div className="card overflow-hidden !p-0">
                <div className="divide-y divide-gray-50">
                  {stats.recentTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          tx.type === 'credit' ? 'bg-green-50' : 'bg-red-50'
                        }`}>
                          {tx.type === 'credit'
                            ? <ArrowDownRight className="w-4 h-4 text-green-600" />
                            : <ArrowUpRight className="w-4 h-4 text-red-600" />
                          }
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                          <p className="text-xs text-gray-500">{tx.user?.name} &middot; {new Date(tx.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <p className={`font-semibold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TASKS SECTION                          */}
      {/* ═══════════════════════════════════════ */}
      {activeSection === 'tasks' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[
              { key: 'all', label: 'All Tasks', count: tasks.length },
              { key: 'pending', label: 'Pending', count: tasks.filter(t => t.status === 'pending').length },
              { key: 'in_progress', label: 'In Progress', count: tasks.filter(t => t.status === 'in_progress').length },
              { key: 'review', label: 'Review', count: tasks.filter(t => t.status === 'review').length },
              { key: 'completed', label: 'Completed', count: tasks.filter(t => t.status === 'completed').length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setTaskFilter(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  taskFilter === tab.key
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  taskFilter === tab.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Task cards */}
          <div className="space-y-3">
            {filteredTasks.length === 0 && (
              <div className="text-center py-12 card">
                <FolderKanban className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No tasks found</p>
              </div>
            )}

            {filteredTasks.map(task => {
              const si = statusConfig[task.status] || statusConfig.pending
              const etaPct = computeEtaProgress(task)
              const etaText = etaRemaining(task)
              return (
                <div key={task.id} className="card hover:border-blue-200 transition-all">
                  <div className="flex flex-col gap-4">
                    {/* Top row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                          <Link href={`/tasks/${task.id}`} className="font-semibold text-gray-900 hover:text-blue-600 truncate transition-colors">
                            {task.title}
                          </Link>
                          <span className={si.class}>{si.label}</span>
                          {task.isRetainer && (
                            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                              Retainer
                            </span>
                          )}
                          {task._count.messages > 0 && (
                            <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                              <MessageSquare className="w-3 h-3" /> {task._count.messages}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" />
                            {task.user.name}{task.user.company ? ` (${task.user.company})` : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            <IndianRupee className="w-3.5 h-3.5" />
                            {formatCurrency(task.totalCost)}
                          </span>
                          <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                          {task.assignedPm && (
                            <span className="flex items-center gap-1 text-indigo-600">
                              <UserCog className="w-3.5 h-3.5" />
                              {task.assignedPm.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={task.status}
                          onChange={e => updateTaskStatus(task.id, e.target.value)}
                          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow"
                        >
                          {Object.entries(statusConfig).map(([key, config]) => (
                            <option key={key} value={key}>{config.label}</option>
                          ))}
                        </select>
                        <Link
                          href={`/tasks/${task.id}`}
                          className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>

                    {/* ETA progress bar */}
                    {task.etaHours && task.etaStartedAt && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            ETA: {task.etaHours + task.etaExtendedBy}h total
                          </span>
                          <span className={etaText === 'Overdue' ? 'text-red-500 font-medium' : ''}>
                            {etaText}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              etaPct >= 100 ? 'bg-red-500' : etaPct >= 75 ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(etaPct, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SERVICES SECTION                       */}
      {/* ═══════════════════════════════════════ */}
      {activeSection === 'services' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Services Management</h2>
            <button
              onClick={() => { resetServiceForm(); setShowAddService(true) }}
              className="btn-primary flex items-center gap-2"
            >
              <PackagePlus className="w-4 h-4" />
              Add Service
            </button>
          </div>

          {/* Add/Edit form */}
          {showAddService && (
            <div className="card border-2 border-blue-100 bg-blue-50/30">
              <h3 className="font-semibold text-gray-900 mb-4">
                {editingServiceId ? 'Edit Service' : 'New Service'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Logo Design"
                    value={serviceForm.name}
                    onChange={e => setServiceForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Design, SEO, Social"
                    value={serviceForm.category}
                    onChange={e => setServiceForm(f => ({ ...f, category: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="0"
                    value={serviceForm.price}
                    onChange={e => setServiceForm(f => ({ ...f, price: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <select
                    className="input-field"
                    value={serviceForm.unit}
                    onChange={e => setServiceForm(f => ({ ...f, unit: e.target.value }))}
                  >
                    <option value="per piece">Per Piece</option>
                    <option value="per hour">Per Hour</option>
                    <option value="per project">Per Project</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Brief description..."
                    value={serviceForm.description}
                    onChange={e => setServiceForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleSaveService} className="btn-primary">
                  {editingServiceId ? 'Update Service' : 'Create Service'}
                </button>
                <button onClick={resetServiceForm} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Services list */}
          {services.length === 0 ? (
            <div className="text-center py-12 card">
              <Settings className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No services found. Add your first service.</p>
            </div>
          ) : (
            <div className="card overflow-hidden !p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Name</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Category</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Price</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Unit</th>
                      <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {services.map(svc => (
                      <tr key={svc.id} className={`hover:bg-gray-50/50 transition-colors ${!svc.isActive ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{svc.name}</p>
                          {svc.description && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">{svc.description}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                            {svc.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(svc.price)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{svc.unit}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleServiceActive(svc)}
                            className="inline-flex items-center gap-1 transition-colors"
                            title={svc.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {svc.isActive ? (
                              <ToggleRight className="w-6 h-6 text-green-500" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-gray-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEditService(svc)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteService(svc.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TEAM SECTION                           */}
      {/* ═══════════════════════════════════════ */}
      {activeSection === 'team' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Team Management</h2>
            <button
              onClick={() => { resetMemberForm(); setShowAddMember(true) }}
              className="btn-primary flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Add Member
            </button>
          </div>

          {/* Add/Edit form */}
          {showAddMember && (
            <div className="card border-2 border-blue-100 bg-blue-50/30">
              <h3 className="font-semibold text-gray-900 mb-4">
                {editingMemberId ? 'Edit Member' : 'New Team Member'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Full name"
                    value={memberForm.name}
                    onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="email@example.com"
                    value={memberForm.email}
                    onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    className="input-field"
                    value={memberForm.role}
                    onChange={e => setMemberForm(f => ({ ...f, role: e.target.value }))}
                  >
                    <option value="pm">Project Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {/* Permissions checkboxes */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                <div className="flex flex-wrap gap-3">
                  {PERMISSION_OPTIONS.map(perm => (
                    <label
                      key={perm.key}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                        memberForm.permissions.includes(perm.key)
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={memberForm.permissions.includes(perm.key)}
                        onChange={() => togglePermission(perm.key)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {perm.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={handleSaveMember} className="btn-primary">
                  {editingMemberId ? 'Update Member' : 'Add Member'}
                </button>
                <button onClick={resetMemberForm} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Team list */}
          {team.length === 0 ? (
            <div className="text-center py-12 card">
              <UserCog className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No team members found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {team.map(member => {
                const perms = parsePermissions(member.permissions)
                return (
                  <div key={member.id} className="card hover:border-blue-200 transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          member.role === 'admin' ? 'bg-purple-50' : 'bg-blue-50'
                        }`}>
                          {member.role === 'admin'
                            ? <Shield className="w-5 h-5 text-purple-600" />
                            : <UserCog className="w-5 h-5 text-blue-600" />
                          }
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{member.name}</p>
                          <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        member.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {member.role === 'admin' ? 'Admin' : 'PM'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      {perms.map(p => (
                        <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {PERMISSION_OPTIONS.find(o => o.key === p)?.label || p}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                      <span className="text-sm text-gray-500 flex items-center gap-1">
                        <FolderKanban className="w-3.5 h-3.5" />
                        {member._count.assignedTasks} assigned tasks
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditMember(member)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteMember(member.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* CLIENTS SECTION                        */}
      {/* ═══════════════════════════════════════ */}
      {activeSection === 'clients' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Client Management</h2>
            <button
              onClick={() => { resetClientForm(); setShowAddClient(true) }}
              className="btn-primary flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Add Client
            </button>
          </div>

          {/* Add Client form */}
          {showAddClient && (
            <div className="card border-2 border-blue-100 bg-blue-50/30">
              <h3 className="font-semibold text-gray-900 mb-4">New Client</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Client name"
                    value={clientForm.name}
                    onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="email@example.com"
                    value={clientForm.email}
                    onChange={e => setClientForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    className="input-field"
                    placeholder="+91 ..."
                    value={clientForm.phone}
                    onChange={e => setClientForm(f => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Company name"
                    value={clientForm.company}
                    onChange={e => setClientForm(f => ({ ...f, company: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Initial Wallet Balance</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="0"
                    value={clientForm.walletBalance}
                    onChange={e => setClientForm(f => ({ ...f, walletBalance: e.target.value }))}
                  />
                </div>
              </div>

              {/* Retainer section */}
              <div className="mt-6 pt-4 border-t border-blue-200/50">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-indigo-500" />
                    Monthly Retainer Deliverables (Optional)
                  </h4>
                  <button
                    type="button"
                    onClick={addRetainerRow}
                    className="btn-secondary text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Item
                  </button>
                </div>

                {retainerItems.length > 0 && (
                  <div className="space-y-3">
                    {retainerItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-200">
                        <select
                          className="input-field flex-1"
                          value={item.serviceItemId}
                          onChange={e => updateRetainerRow(idx, 'serviceItemId', e.target.value)}
                        >
                          <option value="">Select service...</option>
                          {availableServices.map(svc => (
                            <option key={svc.id} value={svc.id}>
                              {svc.name} - {formatCurrency(svc.price)}/{svc.unit}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          className="input-field w-24"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={e => updateRetainerRow(idx, 'quantity', parseInt(e.target.value) || 1)}
                        />
                        <button
                          onClick={() => removeRetainerRow(idx)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={handleSaveClient} className="btn-primary">
                  Add Client
                </button>
                <button onClick={resetClientForm} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Clients list */}
          {clients.length === 0 ? (
            <div className="text-center py-12 card">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No clients found.</p>
            </div>
          ) : (
            <div className="card overflow-hidden !p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Client</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Contact</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Company</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Wallet</th>
                      <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Tasks</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Joined</th>
                      <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {clients.map(client => (
                      <tr key={client.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{client.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {client.email && (
                              <p className="text-sm text-gray-500 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {client.email}
                              </p>
                            )}
                            {client.phone && (
                              <p className="text-sm text-gray-500 flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {client.phone}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {client.company ? (
                            <span className="text-sm text-gray-700 flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-gray-400" />
                              {client.company}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCurrency(client.wallet?.balance || 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                            <FolderKanban className="w-3.5 h-3.5" />
                            {client._count.tasks}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-500">
                          {new Date(client.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openWalletModal(client)}
                              title="Adjust Wallet"
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
                            >
                              <Wallet className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openTaskModal(client)}
                              title="Add Task for Client"
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                            >
                              <PackagePlus className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {/* ── Employees Section ── */}
      {activeSection === 'employees' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Employee Management</h2>
            <button
              onClick={() => setShowAddEmployee(true)}
              className="btn-primary flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> Add Employee
            </button>
          </div>

          {showAddEmployee && (
            <div className="card border-2 border-blue-100 bg-blue-50/30">
              <h3 className="font-semibold text-gray-900 mb-4">New Employee</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input type="text" className="input-field" placeholder="Full name" value={empForm.name} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" className="input-field" placeholder="email@company.com" value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input type="password" className="input-field" placeholder="Set a password" value={empForm.password} onChange={e => setEmpForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role / Specialisation</label>
                  <select className="input-field" value={empForm.employeeRole} onChange={e => setEmpForm(f => ({ ...f, employeeRole: e.target.value }))}>
                    <option value="">Select role</option>
                    <option>Designer</option>
                    <option>Video Editor</option>
                    <option>Content Writer</option>
                    <option>Social Media Manager</option>
                    <option>Developer</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => { setShowAddEmployee(false); setEmpForm({ name: '', email: '', password: '', employeeRole: '' }) }} className="btn-secondary">Cancel</button>
                <button onClick={createEmployee} disabled={savingEmployee} className="btn-primary flex items-center gap-2">
                  {savingEmployee ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Create Employee
                </button>
              </div>
            </div>
          )}

          {employees.length === 0 ? (
            <div className="text-center py-12 card">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No employees yet. Add your first team member.</p>
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Tasks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{emp.email}</td>
                      <td className="px-4 py-3"><span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">{emp.employeeRole || 'Team Member'}</span></td>
                      <td className="px-4 py-3 text-right"><span className="text-sm font-semibold text-gray-700">{emp._count?.employeeTasks ?? 0}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* WALLET ADJUSTMENT MODAL                 */}
      {/* ═══════════════════════════════════════ */}
      {walletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Adjust Wallet</h3>
                <p className="text-sm text-gray-500">{walletModal.client.name}</p>
              </div>
              <button
                onClick={() => setWalletModal(null)}
                className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
              <IndianRupee className="w-4 h-4" />
              Current balance:
              <span className="font-semibold text-gray-900">{formatCurrency(walletModal.client.wallet?.balance || 0)}</span>
            </div>

            <div className="space-y-4 mt-4">
              {/* Type */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setWalletForm(f => ({ ...f, type: 'credit' }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    walletForm.type === 'credit'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  Add Funds
                </button>
                <button
                  type="button"
                  onClick={() => setWalletForm(f => ({ ...f, type: 'debit' }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    walletForm.type === 'debit'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <MinusCircle className="w-4 h-4" />
                  Deduct Funds
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  className="input-field"
                  placeholder="e.g. 5000"
                  value={walletForm.amount}
                  onChange={e => setWalletForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Reason for adjustment"
                  value={walletForm.description}
                  onChange={e => setWalletForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleWalletAdjust}
                disabled={savingWallet}
                className={`btn-primary flex-1 flex items-center justify-center gap-2 ${
                  walletForm.type === 'debit' ? '!bg-red-500 hover:!bg-red-600' : ''
                }`}
              >
                {savingWallet ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  walletForm.type === 'credit' ? <PlusCircle className="w-4 h-4" /> : <MinusCircle className="w-4 h-4" />
                )}
                {walletForm.type === 'credit' ? 'Add Funds' : 'Deduct Funds'}
              </button>
              <button onClick={() => setWalletModal(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* ADD TASK FOR CLIENT MODAL               */}
      {/* ═══════════════════════════════════════ */}
      {taskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 animate-in fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <PackagePlus className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Add Task for Client</h3>
                <p className="text-sm text-gray-500">{taskModal.client.name}{taskModal.client.company ? ` · ${taskModal.client.company}` : ''}</p>
              </div>
              <button
                onClick={() => setTaskModal(null)}
                className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Title *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Social Media Posts – April"
                  value={adminTaskForm.title}
                  onChange={e => setAdminTaskForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  className="input-field min-h-[80px] resize-none"
                  placeholder="Task details..."
                  value={adminTaskForm.description}
                  onChange={e => setAdminTaskForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  className="input-field"
                  value={adminTaskForm.priority}
                  onChange={e => setAdminTaskForm(f => ({ ...f, priority: e.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              {/* Service Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Service Items *</label>
                  <button
                    type="button"
                    onClick={addAdminTaskItem}
                    className="btn-secondary text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Item
                  </button>
                </div>

                {adminTaskItems.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-3 border-2 border-dashed border-gray-200 rounded-xl">
                    No items added yet — click Add Item above
                  </p>
                )}

                {adminTaskItems.length > 0 && (
                  <div className="space-y-2">
                    {adminTaskItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5 border border-gray-200">
                        <select
                          className="input-field flex-1 text-sm"
                          value={item.serviceItemId}
                          onChange={e => updateAdminTaskItem(idx, 'serviceItemId', e.target.value)}
                        >
                          <option value="">Select service...</option>
                          {availableServices.filter(s => s.isActive).map(svc => (
                            <option key={svc.id} value={svc.id}>
                              {svc.name} — {formatCurrency(svc.price)}/{svc.unit}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          className="input-field w-20 text-sm"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={e => updateAdminTaskItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        />
                        <button
                          onClick={() => removeAdminTaskItem(idx)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {/* Cost preview */}
                    {adminTaskItems.some(i => i.serviceItemId) && (
                      <div className="flex justify-between items-center px-2 py-1.5 bg-blue-50 rounded-lg text-sm">
                        <span className="text-gray-600">Estimated total</span>
                        <span className="font-semibold text-blue-700">
                          {formatCurrency(
                            adminTaskItems.reduce((sum, item) => {
                              const svc = availableServices.find(s => s.id === item.serviceItemId)
                              return sum + (svc ? svc.price * item.quantity : 0)
                            }, 0)
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateAdminTask}
                disabled={savingAdminTask}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {savingAdminTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
                Create Task
              </button>
              <button onClick={() => setTaskModal(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
