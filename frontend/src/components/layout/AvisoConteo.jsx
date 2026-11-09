export default function AvisoConteo({ cantidad, tono = "ambar", className = "" }) {
  if (!cantidad) return null;

  return (
    <span
      className={`inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-xs font-bold leading-none text-white ${
        tono === "rojo" ? "bg-red-600" : "bg-amber-500"
      } ${className}`}
    >
      {cantidad > 99 ? "99+" : cantidad}
    </span>
  );
}
