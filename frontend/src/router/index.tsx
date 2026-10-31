import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import AppLayout from '../components/layout/AppLayout'
import RecruitmentHallPage from '../pages/recruitments/RecruitmentHallPage'
import RecruitmentDetailPage from '../pages/recruitments/RecruitmentDetailPage'
import RecruitmentNewPage from '../pages/recruitments/RecruitmentNewPage'
import MyRecruitmentsPage from '../pages/recruitments/MyRecruitmentsPage'
import MyApplicationsPage from '../pages/applications/MyApplicationsPage'
import MessagesPage from '../pages/messages/MessagesPage'
import ChatPage from '../pages/messages/ChatPage'
import MePage from '../pages/me/MePage'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'

export const router = createBrowserRouter([
  { path: '/', element: <RecruitmentHallPage /> },
  { path: '/recruitments/:id', element: <RecruitmentDetailPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/app',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/app/me" replace /> },
      { path: 'recruitments/new', element: <RecruitmentNewPage /> },
      { path: 'recruitments/:id/edit', element: <RecruitmentNewPage /> },
      { path: 'recruitments/mine', element: <MyRecruitmentsPage /> },
      { path: 'applications/mine', element: <MyApplicationsPage /> },
      { path: 'messages', element: <MessagesPage /> },
      { path: 'messages/:cid', element: <ChatPage /> },
      { path: 'me', element: <MePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
