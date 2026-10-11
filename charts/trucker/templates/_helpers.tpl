{{- define "trucker.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "trucker.fullname" -}}
{{- if contains (include "trucker.name" .) .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "trucker.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "trucker.labels" -}}
app.kubernetes.io/name: {{ include "trucker.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "trucker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "trucker.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}