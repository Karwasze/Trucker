import { Alert } from 'react-native';

/** Asks before deleting a logged workout; `onConfirm` runs only on Delete. */
export function confirmDeleteWorkout(onConfirm: () => void, onCancel?: () => void) {
  Alert.alert(
    'Delete workout?',
    'This removes the logged sets. Plan progression already applied is not undone.',
    [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ],
    // Android can dismiss the dialog by tapping outside it.
    { cancelable: true, onDismiss: onCancel }
  );
}
