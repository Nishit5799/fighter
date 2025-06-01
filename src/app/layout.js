import "./globals.css";
import { SocketProvider } from "../context/SocketContext";

export const metadata = {
  title: "Fight Arena",
  description: "Fight till you die",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
