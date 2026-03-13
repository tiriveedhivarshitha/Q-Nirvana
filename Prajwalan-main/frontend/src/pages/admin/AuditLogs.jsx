import { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
    FileText, Shield, Search, Filter,
    Calendar, Clock, User, ArrowRight,
    Activity, LogIn, Database, Settings
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminAuditLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/audit-logs');
            setLogs(res.data.logs || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (action = '') => {
        const act = (action || '').toUpperCase();
        if (act.includes('LOGIN')) return <LogIn size={14} className="text-blue-500" />;
        if (act.includes('USER')) return <User size={14} className="text-teal-500" />;
        if (act.includes('BED')) return <Database size={14} className="text-purple-500" />;
        if (act.includes('EMERGENCY')) return <Activity size={14} className="text-danger" />;
        if (act.includes('CONFIG')) return <Settings size={14} className="text-slate-500" />;
        return <FileText size={14} className="text-slate-400" />;
    };

    const filteredLogs = logs.filter(l => {
        const action = (l.action || l.action_type || '').toLowerCase();
        const actor = (l.admin_name || 'System').toLowerCase();
        const details = (typeof l.details === 'string' ? l.details : JSON.stringify(l.details || '')).toLowerCase();
        const search = filter.toLowerCase();
        return action.includes(search) || actor.includes(search) || details.includes(search);
    });

    return (
        <div>
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h2 className="section-title">System Audit Trail</h2>
                    <p className="section-sub">Immutable ledger of all administrative actions and security events</p>
                </div>
                <div className="flex gap-4">
                    <div className="stat-label">Security Protocol: <strong className="text-success">ACTIVE</strong></div>
                    <button className="btn btn-outline btn-sm" onClick={loadLogs}>Refresh Feed</button>
                </div>
            </div>

            <div className="card mb-6">
                <div className="card-body">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            className="form-control pl-10"
                            placeholder="Filter by action, user, or keyword..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-body p-0">
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Actor</th>
                                    <th>Action</th>
                                    <th>Meta Details</th>
                                    <th>IP Address</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array(8).fill(0).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan="5"><div className="h-10 bg-slate-50 rounded" /></td>
                                        </tr>
                                    ))
                                ) : filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="text-center py-20">
                                            <Shield size={48} className="mx-auto text-slate-200 mb-4" />
                                            <p className="text-muted">No audit records found</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log, idx) => (
                                        <tr key={log.id || idx} className="hover:bg-slate-50/50">
                                            <td className="whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-700">
                                                        {log.created_at ? new Date(log.created_at).toLocaleDateString() : 'N/A'}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        {log.created_at ? new Date(log.created_at).toLocaleTimeString() : '--:--:--'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
                                                        {(log.admin_name || 'System').charAt(0)}
                                                    </div>
                                                    <span className="text-sm font-semibold">{log.admin_name || 'System'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-100 w-fit">
                                                    {getActionIcon(log.action || log.action_type || '')}
                                                    <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                                                        {log.action || log.action_type || 'UNKNOWN_ACTION'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="max-w-xs">
                                                <p className="text-xs text-slate-500 truncate" title={JSON.stringify(log.details || {})}>
                                                    {typeof log.details === 'string' ? log.details : JSON.stringify(log.details || 'No details')}
                                                </p>
                                            </td>
                                            <td className="font-mono text-[10px] text-slate-400">
                                                {log.ip_address || '127.0.0.1'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="card-footer bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">End of Log Stream</p>
                    <button className="btn btn-ghost btn-sm text-[10px] font-bold text-navy">EXPORT PDF</button>
                </div>
            </div>
        </div>
    );
}
