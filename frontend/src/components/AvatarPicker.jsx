import Modal from './ui/Modal'
import CollectorAvatar from './CollectorAvatar'
import { useSettings } from '../contexts/SettingsContext'

const AVATAR_IDS = Array.from({ length: 36 }, (_, index) => index + 1)

export default function AvatarPicker({ isOpen, onClose, onSelect, currentAvatarId }) {
  const { t } = useSettings()

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('auth.chooseAvatar')}
      size="lg"
      mobileSheet={false}
      className="bg-bg-card"
    >
      <div className="space-y-4 p-4">
        <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-bg-primary p-3">
          <div className="grid grid-cols-6 gap-3">
            {AVATAR_IDS.map((avatarId) => {
              const isSelected = Number(currentAvatarId) === avatarId

              return (
                <button
                  key={avatarId}
                  type="button"
                  onClick={() => {
                    onSelect(avatarId)
                    onClose()
                  }}
                  className={[
                    'flex h-16 w-full items-center justify-center rounded-xl border bg-bg-card transition-transform duration-150 hover:scale-105',
                    isSelected ? 'border-brand-red ring-2 ring-brand-red/70' : 'border-border hover:border-brand-red/40',
                  ].join(' ')}
                  title={`Collector avatar ${avatarId}`}
                >
                  <CollectorAvatar avatarId={avatarId} username={`Avatar ${avatarId}`} className="h-12 w-12" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
