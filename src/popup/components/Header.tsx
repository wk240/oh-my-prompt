import { Download, Upload } from 'lucide-react'

interface HeaderProps {
  onImport: () => void
  onExport: () => void
}

function Header({ onImport, onExport }: HeaderProps) {
  return (
    <header className="h-[68px] px-6 flex items-center justify-between border-b border-[#E5E5E5] bg-white">
      {/* Brand Section */}
      <div className="flex items-center gap-2.5">
        {/* Lightning Bolt Icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9.5 1L4 8H7.5L6.5 15L12 8H8.5L9.5 1Z"
            fill="#171717"
          />
        </svg>
        {/* Title */}
        <span
          className="text-[16px] font-semibold text-[#171717] tracking-[1px]"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Prompt Script
        </span>
      </div>

      {/* Actions Section */}
      <div className="flex items-center gap-5">
        <button
          onClick={onImport}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="导入"
        >
          <Upload className="w-[20px] h-[20px] text-[#171717]" />
        </button>
        <button
          onClick={onExport}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="导出"
        >
          <Download className="w-[20px] h-[20px] text-[#171717]" />
        </button>
      </div>
    </header>
  )
}

export default Header