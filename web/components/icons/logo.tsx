export const LogoIcon = (props: React.SVGProps<SVGSVGElement>) => {
    return (
        <svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            role="img"
            aria-labelledby="skygazer42-logo-title"
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            <title id="skygazer42-logo-title">skygazer42</title>
            <defs>
                <linearGradient id="skygazer42-sky" x1="18" y1="102" x2="102" y2="18" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#22D3EE" />
                    <stop offset="0.48" stopColor="#6366F1" />
                    <stop offset="1" stopColor="#F59E0B" />
                </linearGradient>
                <linearGradient id="skygazer42-mark" x1="30" y1="86" x2="89" y2="31" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#E0F2FE" />
                    <stop offset="0.58" stopColor="#FFFFFF" />
                    <stop offset="1" stopColor="#FDE68A" />
                </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="50" fill="#020617" />
            <path
                d="M18 70C29 40 54 24 88 23C73 33 64 46 61 62C57 83 39 95 18 70Z"
                fill="url(#skygazer42-sky)"
                opacity="0.92"
            />
            <path
                d="M22 77C39 88 68 88 96 69"
                fill="none"
                stroke="#E0F2FE"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.75"
            />
            <path
                d="M36 50C43 43 53 43 60 50C53 57 43 57 36 50Z"
                fill="none"
                stroke="url(#skygazer42-mark)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M64 50L80 34M75 34H82V41"
                fill="none"
                stroke="url(#skygazer42-mark)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <text
                x="38"
                y="86"
                fill="url(#skygazer42-mark)"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontSize="24"
                fontWeight="800"
                letterSpacing="0"
            >
                42
            </text>
            <circle cx="88" cy="28" r="4" fill="#FDE68A" />
            <circle cx="34" cy="32" r="2.5" fill="#BAE6FD" />
            <circle cx="96" cy="58" r="2" fill="#E0F2FE" />
        </svg>
    )
}
