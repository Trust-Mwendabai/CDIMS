export const AVATARS = ['ocean', 'sunset', 'forest', 'violet', 'rose', 'amber', 'slate', 'teal'];

/** Round avatar showing the user's initial on their chosen colour. */
export default function Avatar({ user, size = 36, className = '' }) {
  const colour = user.preferences?.avatar || 'ocean';
  return (
    <span className={`avatar av-${colour} ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {user.full_name.charAt(0).toUpperCase()}
    </span>
  );
}
