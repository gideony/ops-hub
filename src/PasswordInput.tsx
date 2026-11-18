import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import './password-input.css'

export function passwordToggleLabel(visible: boolean) {
  return visible ? 'Ocultar senha' : 'Ver senha'
}

type Props = InputHTMLAttributes<HTMLInputElement> & {
  initiallyVisible?: boolean
  wrapClassName?: string
}

export default function PasswordInput({
  initiallyVisible = false,
  wrapClassName = '',
  className = '',
  ...props
}: Props) {
  const [visible, setVisible] = useState(initiallyVisible)
  const label = passwordToggleLabel(visible)

  return (
    <span className={`password-input-wrap ${wrapClassName}`.trim()}>
      <input {...props} type={visible ? 'text' : 'password'} className={className} />
      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setVisible(current => !current)}
        title={label}
        aria-label={label}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </span>
  )
}
