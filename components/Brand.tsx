/**
 * Shared branding: the Government of Punjab emblem used across the app, and
 * the hand-drawn wheat backdrop behind the sign-in screen.
 */

/** The Punjab emblem. Transparent PNG, so it sits on a light surface. */
export function Emblem({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // A plain img keeps a small static asset independent of the image
    // optimiser, which matters on the Passenger host.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/punjab-emblem.png"
      alt="Government of Punjab"
      width={size}
      height={Math.round((size * 1011) / 1280)}
      className={className}
      style={{ width: size, height: "auto" }}
    />
  );
}

/**
 * Full-bleed decorative backdrop: the hand-drawn wheat-field illustration,
 * held at low opacity and washed out towards the middle so the sign-in card
 * always reads clearly on top of it. Purely decorative, so it is hidden from
 * assistive tech and ignores pointer events.
 */
export function WheatBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* object-bottom keeps the wheat detail in frame when a tall phone
          screen crops the wide illustration. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/wheat-field.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-bottom opacity-[0.28] select-none"
        draggable={false}
      />
      {/* Softens the illustration into the page and keeps the centre calm. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0.62)_42%,rgba(255,255,255,0.18)_72%,rgba(255,255,255,0)_100%)]" />
      {/* A little extra lift at the very top and bottom edges. */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/80 to-transparent" />
    </div>
  );
}

/** The "Developed By Avalora Labs" credit shown under the sign-in card. */
export function AvaloraCredit() {
  return (
    <a
      href="https://avaloralabs.com"
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-block rounded-lg px-4 py-2 text-center transition-colors hover:bg-white/60"
    >
      <span className="block text-sm font-semibold text-gray-700 transition-colors group-hover:text-emerald-700">
        Developed By Avalora Labs (SMC-PVT) LTD
      </span>
      <span className="mt-0.5 block text-xs text-gray-500 transition-colors group-hover:text-emerald-600">
        AI Automations, Custom Management Softwares And Solutions
      </span>
    </a>
  );
}
