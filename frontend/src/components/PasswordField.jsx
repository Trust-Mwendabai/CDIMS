import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Password input with a show/hide toggle. Extra children render below the input. */
export default function PasswordField({ label, id, valid, invalid, hint, children, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw">
        <input id={id} className={`input ${valid ? 'is-valid' : ''} ${invalid ? 'is-invalid' : ''}`}
          type={show ? 'text' : 'password'} {...props} />
        <button type="button" className="pw-toggle" onClick={() => setShow(!show)}
          aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {children}
      {hint && <small className={invalid ? 'hint bad' : 'hint'}>{hint}</small>}
    </div>
  );
}
