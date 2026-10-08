import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { small?: boolean };

/** Design-system icons: 20px grid, 2px stroke, square caps, miter joins (see .ic in components.css). */
function icon(children: ReactNode) {
  return function Icon({ small, className, ...props }: IconProps) {
    return (
      <svg className={`ic${small ? " ic-sm" : ""}${className ? ` ${className}` : ""}`} viewBox="0 0 20 20" aria-hidden="true" {...props}>
        {children}
      </svg>
    );
  };
}

export const PlayIcon = icon(<path d="M5 3l12 7-12 7z" fill="currentColor" />);
export const ScreenShareIcon = icon(<path d="M2 4h16v10H2zM7 18h6M10 14v4M8 9l2-2 2 2M10 7v4" />);
export const StopIcon = icon(<path d="M4 4h12v12H4z" />);
export const FullscreenIcon = icon(<path d="M2 7V2h5M13 2h5v5M18 13v5h-5M7 18H2v-5" />);
export const ExitFullscreenIcon = icon(<path d="M7 2v5H2M18 7h-5V2M13 18v-5h5M2 13h5v5" />);
export const CopyIcon = icon(<path d="M7 7h11v11H7zM13 7V2H2v11h5" />);
export const LinkIcon = icon(<path d="M8 12l4-4M7 9L3 13l4 4 3-3M13 11l4-4-4-4-3 3" />);
export const HelpIcon = icon(<path d="M7 7.5C7 5.5 8.5 4.5 10 4.5s3 1 3 2.8c0 2.7-3 2.7-3 5M10 15v1.5" />);
export const ChatIcon = icon(<path d="M2 3h16v11H9l-5 4v-4H2z" />);
export const LeaveIcon = icon(<path d="M8 2H2v16h6M8 10h10M14 6l4 4-4 4" />);
export const MicIcon = icon(<path d="M7 2h6v9H7zM4 9v2a6 6 0 0 0 12 0V9M10 17v2" />);
export const MicOffIcon = icon(<path d="M7 2h6v9H7zM4 9v2a6 6 0 0 0 12 0V9M10 17v2M2 2l16 16" />);
export const VolumeIcon = icon(<path d="M2 7h4l5-4v14l-5-4H2zM14 7l3 3-3 3" />);
export const MuteIcon = icon(<path d="M2 7h4l5-4v14l-5-4H2zM14 7l4 6M18 7l-4 6" />);
export const CheckIcon = icon(<path d="M3 10l5 5 9-10" />);
export const WarnIcon = icon(<path d="M10 2l9 16H1zM10 8v5M10 15v1.5" />);
export const CloseIcon = icon(<path d="M4 4l12 12M16 4L4 16" />);
export const SendIcon = icon(<path d="M2 2l16 8-16 8 3-8z" />);
export const RetryIcon = icon(<path d="M16 8A6 6 0 1 0 15 14M16 3v5h-5" />);
export const SunIcon = icon(<path d="M10 6v8M6 10h8M10 1v3M10 16v3M1 10h3M16 10h3M4 4l2 2M14 14l2 2M16 4l-2 2M6 14l-2 2" />);
export const MoonIcon = icon(<path d="M16 12A7 7 0 0 1 8 4a7 7 0 1 0 8 8z" />);
