import { FiEdit3, FiTrash2 } from 'react-icons/fi';
import { formatCurrency, formatDate, getRecordStatus } from './App.jsx';

function RecordCard({ record }) {
  const status = getRecordStatus(record);
  
  const handleEdit = () => {
    // Trigger edit from parent
    window.dispatchEvent(new CustomEvent('editRecord', { detail: record.id }));
  };

  const handleDelete = () => {
    // Trigger delete from parent
    window.dispatchEvent(new CustomEvent('deleteRecord', { detail: record.id }));
  };

  return (
    <article className="group rounded-2xl border border-orange-200/50 bg-white p-6 shadow-subtle hover:shadow-lg hover:border-orange-300 transition-all duration-300 hover:-translate-y-1">
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-1">
          <h3 className="font-bold text-xl text-orange-900 truncate" title={record.vehicleId}>
            {record.vehicleId}
          </h3>
          <p className="text-sm text-orange-700">{record.zone}</p>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={handleEdit}
            className="p-2 rounded-xl bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
            title="Edit record"
          >
            <FiEdit3 className="w-4 h-4" />
          </button>
          <button 
            onClick={handleDelete}
            className="p-2 rounded-xl bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors"
            title="Delete record"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Speed</p>
          <p className="text-2xl font-bold text-orange-900">{record.speed} km/h</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Fine</p>
          <p className="text-xl font-bold text-orange-900">{formatCurrency(record.fine)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status.className}`}>
          {status.label}
        </span>
        <p className="text-sm text-orange-700">{formatDate(record.createdAt)}</p>
      </div>
    </article>
  );
}

export default RecordCard;

