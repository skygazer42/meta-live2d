import App from "../app";

export default async function Page({
    params,
}: {
    params: Promise<{ appId: string }>;
}) {
    const { appId } = await params;

    return (
        <App appId={appId} />
    );
}
