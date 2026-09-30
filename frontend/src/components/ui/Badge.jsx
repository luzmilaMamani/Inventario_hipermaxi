const styles = {
  ACTIVO: "bg-green-100 text-green-700",
  INACTIVO: "bg-gray-200 text-gray-700",
  DESCONTINUADO: "bg-red-100 text-red-700",
};

export default function Badge({ estado }) {
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-semibold ${
        styles[estado] || "bg-gray-100 text-gray-600"
      }`}
    >
      {estado}
    </span>
  );
}