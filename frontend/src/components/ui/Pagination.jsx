export default function Pagination({ page, limit, total, onChange }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-sm text-gray-600">
        Página {page} de {totalPages} ({total} registros)
      </span>
      <div className="flex gap-2">
        <button
          className="btn-secondary text-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <button
          className="btn-secondary text-sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}